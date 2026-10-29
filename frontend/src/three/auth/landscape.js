import * as THREE from 'three'

import { GROUND_Y, mulberry32 } from './config'

/**
 * 雪谷：三圈远山 + 起伏的雪原。
 *
 * 远山用一圈「三角带」直接搭出来：每个角度一根从谷底到山顶的棱线，
 * 高度由几个整数倍正弦叠加（整数倍才能首尾无缝）。近处雪原是一张
 * 细分平面，顶点按低频噪声起伏，越高的地方颜色越白。
 */

function ringGeometry({ radius, height, phase, segments, baseY }) {
  const positions = []
  const colors = []
  const indices = []

  const rock = new THREE.Color(0x0d1727)
  const snow = new THREE.Color(0xbccde4)

  // 每个角度的山脊高度：低频起伏 + 尖峰
  const heights = []
  for (let i = 0; i <= segments; i += 1) {
    const a = (i / segments) * Math.PI * 2
    const wave =
      0.5 +
      0.28 * Math.sin(a * 5 + phase) +
      0.2 * Math.sin(a * 11 + phase * 2.3) +
      0.12 * Math.sin(a * 23 + phase * 0.7)
    const peak = Math.pow(Math.max(0, wave), 2.1)
    heights.push(height * (0.32 + 0.68 * peak))
  }

  const random = mulberry32(Math.round(phase * 1000) + segments)
  for (let i = 0; i <= segments; i += 1) {
    const a = (i / segments) * Math.PI * 2
    const cos = Math.cos(a)
    const sin = Math.sin(a)
    const top = heights[i]

    positions.push(cos * radius, baseY, sin * radius)
    positions.push(cos * radius * (0.985 + random() * 0.02), top, sin * radius)

    const mix = Math.min(1, 0.16 + (top / height) * 0.5 + random() * 0.18)
    const bottomColor = rock.clone().lerp(snow, 0.06)
    const topColor = rock.clone().lerp(snow, mix)
    colors.push(bottomColor.r, bottomColor.g, bottomColor.b)
    colors.push(topColor.r, topColor.g, topColor.b)
  }

  for (let i = 0; i < segments; i += 1) {
    const b0 = i * 2
    const t0 = i * 2 + 1
    const b1 = (i + 1) * 2
    const t1 = (i + 1) * 2 + 1
    indices.push(b0, t0, b1, t0, t1, b1)
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

/**
 * 程序化雪面贴图：细碎的雪粒 + 横向风纹 + 少量压暗的斑。
 *
 * 顶点色只负责大块的明暗，这层贴图负责「近处看得出是雪」。
 * 贴图接近白色，靠顶点色乘上去，不会把整片雪提亮成塑料。
 */
function snowTexture() {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  const random = mulberry32(5150)

  ctx.fillStyle = '#f4f8fe'
  ctx.fillRect(0, 0, size, size)

  // 风纹：细长的横向亮线，雪被风吹过的方向
  for (let i = 0; i < 90; i += 1) {
    const y = random() * size
    const x = random() * size
    const length = 18 + random() * 70
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.14 + random() * 0.22})`
    ctx.lineWidth = 0.6 + random() * 1.4
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.quadraticCurveTo(x + length * 0.5, y + 1.5, x + length, y + 2.5)
    ctx.stroke()
  }

  // 雪粒：亮暗各一半，太干净会像一张白纸
  for (let i = 0; i < 1400; i += 1) {
    const x = random() * size
    const y = random() * size
    const r = 0.4 + random() * 1.1
    const dark = random() > 0.45
    ctx.fillStyle = dark
      ? `rgba(126, 150, 182, ${0.05 + random() * 0.1})`
      : `rgba(255, 255, 255, ${0.12 + random() * 0.2})`
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(110, 110)
  texture.anisotropy = 4
  return texture
}

/** 雪面的高度：树、石头、探照灯光斑都按它落位，否则会陷进雪里 */
export function groundHeightAt(x, z) {
  const dune =
    2.6 * Math.sin(x * 0.021) * Math.cos(z * 0.028) +
    1.15 * Math.sin(x * 0.055 + z * 0.048) +
    0.5 * Math.sin(x * 0.13 - z * 0.105) +
    0.22 * Math.sin(x * 0.34 + z * 0.27)
  const falloff = Math.min(1, Math.hypot(x, z) / 240)
  return GROUND_Y + dune * (0.3 + falloff * 0.9)
}

function groundGeometry() {
  const geometry = new THREE.PlaneGeometry(2600, 2600, 170, 170)
  geometry.rotateX(-Math.PI / 2)

  const position = geometry.attributes.position
  const colors = new Float32Array(position.count * 3)
  const base = new THREE.Color(0x93a7c2)
  const crest = new THREE.Color(0xeaf2fb)
  const color = new THREE.Color()

  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i)
    const z = position.getZ(i)
    // 低频雪脊 + 中频起伏 + 一层细碎的风纹：
    // 只有低频时这 150m 会被读成一片平整的蓝色湖面
    const y = groundHeightAt(x, z)
    position.setY(i, y)

    const lift = Math.min(1, Math.max(0, (y - GROUND_Y) / 3.4))
    color.copy(base).lerp(crest, 0.22 + lift * 0.68)
    colors[i * 3] = color.r
    colors[i * 3 + 1] = color.g
    colors[i * 3 + 2] = color.b
  }

  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.computeVertexNormals()
  return geometry
}

export function buildLandscape() {
  const group = new THREE.Group()

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.92,
    metalness: 0.02,
    // 雪面必须平滑着色：flatShading 下每 15m 一个面片，
    // 近处会被读成一整片平板，「雪原」就变成了「蓝湖」
    flatShading: false,
    side: THREE.DoubleSide,
    fog: true,
  })

  const rings = [
    { radius: 168, height: 38, phase: 1.3, segments: 190, baseY: GROUND_Y - 2 },
    { radius: 268, height: 78, phase: 4.1, segments: 220, baseY: GROUND_Y - 6 },
    { radius: 400, height: 138, phase: 7.7, segments: 250, baseY: GROUND_Y - 10 },
  ]

  const meshes = rings.map((ring) => {
    // 远山要留棱角：一坡一坡的硬边才读得出是石头的山脊
    const rockMaterial = material.clone()
    rockMaterial.flatShading = true
    const mesh = new THREE.Mesh(ringGeometry(ring), rockMaterial)
    mesh.frustumCulled = false
    group.add(mesh)
    return mesh
  })

  const snow = new THREE.Mesh(groundGeometry(), material)
  snow.receiveShadow = false
  // 雪面贴图只有地面需要：远山用同一份材质会把噪点带到轮廓上
  material.map = snowTexture()
  material.roughness = 0.96
  group.add(snow)

  return { group, meshes, snow, materials: [material, ...meshes.map((m) => m.material)] }
}
