import * as THREE from 'three'

import { mulberry32 } from './config'

/**
 * 夜空：渐变穹顶 + 星点 + 一轮过曝的月亮。
 *
 * 穹顶用 ShaderMaterial 而不是 CanvasTexture，切换模式时才能对
 * 三个颜色 uniform 做插值（贴图没法插值）。
 */

const skyVertex = /* glsl */ `
  varying vec3 vPos;
  void main() {
    vPos = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const skyFragment = /* glsl */ `
  varying vec3 vPos;
  uniform vec3 cTop;
  uniform vec3 cMid;
  uniform vec3 cHorizon;
  uniform vec3 cBottom;

  void main() {
    float h = normalize(vPos).y;
    vec3 col = mix(cHorizon, cMid, smoothstep(0.0, 0.26, h));
    col = mix(col, cTop, smoothstep(0.2, 0.86, h));
    col = mix(cBottom, col, smoothstep(-0.3, 0.02, h));
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

export function buildSky() {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      cTop: { value: new THREE.Color(0x01030a) },
      cMid: { value: new THREE.Color(0x06121f) },
      cHorizon: { value: new THREE.Color(0x0b2233) },
      cBottom: { value: new THREE.Color(0x02040a) },
    },
    vertexShader: skyVertex,
    fragmentShader: skyFragment,
  })

  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1600, 32, 20), material)
  mesh.frustumCulled = false
  return { mesh, uniforms: material.uniforms }
}

export function buildStars() {
  const count = 1400
  const positions = new Float32Array(count * 3)
  const random = mulberry32(20261022)
  for (let i = 0; i < count; i += 1) {
    const theta = random() * Math.PI * 2
    // 相机是俯视的，星星只铺地平线往上 0~40° 这一带
    const phi = 0.06 + random() * 0.7
    const radius = 1250 * (0.9 + random() * 0.1)
    const sin = Math.sin(phi)
    positions[i * 3] = Math.cos(theta) * sin * radius
    positions[i * 3 + 1] = Math.cos(phi) * radius
    positions[i * 3 + 2] = Math.sin(theta) * sin * radius
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  const material = new THREE.PointsMaterial({
    color: 0xdce9ff,
    size: 2.1,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  })
  const points = new THREE.Points(geometry, material)
  points.frustumCulled = false
  return { points, material }
}

/** 一张以中心为原点的径向渐变贴图 */
function glowTexture(stops, size = 256) {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  const c = size / 2
  const gradient = ctx.createRadialGradient(c, c, 0, c, c, c)
  for (const [offset, color] of stops) gradient.addColorStop(offset, color)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

export { glowTexture }

export function buildMoon() {
  const root = new THREE.Group()

  // 本体给到 >1：toneMapped:false 下会被钳到纯白，正好是「过曝」
  const core = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture([
        [0, 'rgba(255,255,255,1)'],
        [0.72, 'rgba(238,246,255,0.98)'],
        [0.86, 'rgba(214,232,255,0.75)'],
        [1, 'rgba(190,214,255,0)'],
      ]),
      color: new THREE.Color().setRGB(2.2, 2.32, 2.5),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
      fog: false,
    }),
  )
  core.scale.setScalar(30)

  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture([
        [0, 'rgba(236,245,255,0.5)'],
        [0.3, 'rgba(206,226,255,0.2)'],
        [0.66, 'rgba(180,206,246,0.06)'],
        [1, 'rgba(170,200,246,0)'],
      ]),
      color: new THREE.Color().setRGB(0.9, 1.02, 1.22),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
      fog: false,
    }),
  )
  halo.scale.setScalar(150)

  root.add(halo, core)
  root.position.set(-320, 118, -860)
  root.renderOrder = -1
  return { root, core, halo }
}
