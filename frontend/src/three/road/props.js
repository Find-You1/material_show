import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

import { PALETTE, themeProfile } from './config'
import { frameAt, UP } from './path'

/**
 * 路侧陈设：杉树剪影、碎石、中央虚线。
 *
 * 山路只有白路面和护栏时太空，像一条悬在黑场里的带子；
 * 这些物件都压成近黑或中灰，只负责给两侧填出层次和速度感，不抢画框。
 */

/** 固定种子的伪随机：每次刷新路侧布局一致，否则树会跳来跳去 */
function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 给整块几何刷一个统一的顶点色：树干要比树冠暗，才不会变成一根白柱子 */
function paint(geometry, value) {
  const count = geometry.attributes.position.count
  const colors = new Float32Array(count * 3)
  colors.fill(value)
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return geometry
}

/** 一棵杉树：树干 + 两层锥体，合成一个几何体，用 InstancedMesh 铺满几百棵 */
function buildTreeGeometry() {
  // 树干只压暗一半多一点：压到 0.2 时树干几乎是纯黑，森林里直接和地面糊成一片
  const trunk = paint(new THREE.CylinderGeometry(0.09, 0.14, 1.1, 5), 0.55)
  trunk.translate(0, 0.55, 0)
  const lower = paint(new THREE.ConeGeometry(1.15, 2.7, 7), 1)
  lower.translate(0, 2.35, 0)
  const upper = paint(new THREE.ConeGeometry(0.72, 2.1, 7), 1)
  upper.translate(0, 3.45, 0)
  return mergeGeometries([trunk, lower, upper])
}

/** 一棵仙人掌：主干 + 两根折起来的侧臂，沙漠主题专用 */
function buildCactusGeometry() {
  const parts = []

  const trunk = paint(new THREE.CapsuleGeometry(0.26, 2.0, 4, 8), 1)
  trunk.translate(0, 1.3, 0)
  parts.push(trunk)

  for (const side of [-1, 1]) {
    // 先横向伸出去一段，再折上来一段，轮廓就是 saguaro 的手臂
    const elbow = paint(new THREE.CapsuleGeometry(0.15, 0.5, 3, 6), 0.9)
    elbow.rotateZ(Math.PI / 2)
    elbow.translate(side * 0.34, 1.32, 0)
    parts.push(elbow)

    const arm = paint(new THREE.CapsuleGeometry(0.15, 0.72, 3, 6), 0.9)
    arm.translate(side * 0.62, 1.68, 0)
    parts.push(arm)
  }

  return mergeGeometries(parts)
}

/** 矮灌木：三团压扁的球叠在一起，森林 / 黎明 / 暮色 / 沙漠的地被层 */
function buildBushGeometry() {
  const parts = []
  for (const [x, z, s] of [
    [0, 0, 1],
    [0.44, 0.16, 0.72],
    [-0.38, -0.14, 0.64],
  ]) {
    const blob = paint(new THREE.IcosahedronGeometry(0.5, 0), 0.95)
    blob.scale(s, s * 0.62, s)
    blob.translate(x, 0.26 * s, z)
    parts.push(blob)
  }
  return mergeGeometries(parts)
}

/** 大块岩石：把二十面体压扁并抖动顶点，山地 / 雪原 / 沙漠的体块 */
function buildBoulderGeometry(random) {
  const rock = paint(new THREE.IcosahedronGeometry(1, 0), 1)
  const position = rock.attributes.position
  for (let i = 0; i < position.count; i += 1) {
    const jitter = 0.72 + random() * 0.5
    position.setXYZ(
      i,
      position.getX(i) * jitter,
      position.getY(i) * jitter * 0.66,
      position.getZ(i) * jitter,
    )
  }
  position.needsUpdate = true
  rock.computeVertexNormals()
  return rock
}

/** 星空：只铺地平线以上，跟着天空球一起走，所以永远在「无限远」 */
function buildStarField() {
  const count = 900
  const positions = new Float32Array(count * 3)
  const random = mulberry32(913)
  for (let i = 0; i < count; i += 1) {
    const theta = random() * Math.PI * 2
    // phi 从 +Y 量起。相机只有 36° 垂直视场、还略微俯视，
    // 画面里能看到的天空其实只有地平线往上 0~24° 这一窄条 ——
    // 之前铺 8°~83° 的高空，星星全在取景框外面，一颗也看不到
    const phi = 1.15 + random() * 0.41
    const radius = 720 * (0.92 + random() * 0.08)
    const sin = Math.sin(phi)
    positions[i * 3] = Math.cos(theta) * sin * radius
    positions[i * 3 + 1] = Math.cos(phi) * radius
    positions[i * 3 + 2] = Math.sin(theta) * sin * radius
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  const material = new THREE.PointsMaterial({
    color: 0xdfe8ff,
    size: 2.6,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    fog: false,
  })
  const points = new THREE.Points(geometry, material)
  points.frustumCulled = false
  return { points, material }
}

/** 落雪：一盒会循环下落的白点，盒子跟着天空球走，车开多远都在下雪 */
function buildSnowField() {
  const count = 430
  const positions = new Float32Array(count * 3)
  const seeds = new Float32Array(count)
  const random = mulberry32(331)
  for (let i = 0; i < count; i += 1) {
    positions[i * 3] = (random() - 0.5) * 84
    positions[i * 3 + 1] = random() * 44
    positions[i * 3 + 2] = (random() - 0.5) * 84
    seeds[i] = random()
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  const base = positions.slice()
  const material = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.17,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    fog: false,
  })
  const points = new THREE.Points(geometry, material)
  points.frustumCulled = false

  return {
    points,
    material,
    update(time) {
      const array = geometry.attributes.position.array
      for (let i = 0; i < count; i += 1) {
        const seed = seeds[i]
        // 每片雪速度略不同，落下 44m 后回到顶部
        const fall = (time * (1.5 + seed * 1.9)) % 44
        array[i * 3] = base[i * 3] + Math.sin(time * 0.7 + seed * 26) * 1.5
        array[i * 3 + 1] = ((((base[i * 3 + 1] - fall) % 44) + 44) % 44) - 4
        array[i * 3 + 2] = base[i * 3 + 2]
      }
      geometry.attributes.position.needsUpdate = true
    },
  }
}

// ---- 天象：本体 + 光冕 + 射线 ----
// 以前只有一张径向渐变的 Sprite，屏幕上就是一团会发光的球，没有方向感。
// 真实的太阳是「过曝本体 → 大气散射的日冕 → 长短不一的射线」三层，
// 月亮则是「有明确边缘的圆盘 → 一圈冷色月华」。
// 不能用后处理 God Rays（离屏链会让合成器整帧丢内容），
// 所以直接把射线画进贴图，加色混合叠三层 —— 读起来就是自然折射的光。
const CELESTIAL_SIZE = 512

/** 一张以中心为原点的径向渐变贴图 */
function discTexture(stops) {
  const size = CELESTIAL_SIZE
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

/** 柔光：没有射线的菱形衰减，太阳的外晕与月华共用 */
function softGlowTexture(stops) {
  const size = CELESTIAL_SIZE
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  const c = size / 2
  const glow = ctx.createRadialGradient(c, c, 0, c, c, c)
  for (const [offset, color] of stops) glow.addColorStop(offset, color)
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, size, size)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

/**
 * 日冕：一圈柔光 + 长短不一的放射线。
 *
 * 之前射线的透明度只有 0.05~0.17，再乘上材质的 0.85，
 * 画到屏幕上就是一点点灰，肉眼读不出「光在散射」。
 * 现在每根线从核心向外做三段衰减：根部 0.5、中段 0.3、末端直接归零，
 * 再加一层模糊。看起来是大气里的折射，不是镜头星芒。
 */
function coronaTexture(seed, rayCount, rayLength) {
  const size = CELESTIAL_SIZE
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  const c = size / 2
  const random = mulberry32(seed)

  const glow = ctx.createRadialGradient(c, c, 0, c, c, c)
  glow.addColorStop(0, 'rgba(255,255,255,0.55)')
  glow.addColorStop(0.16, 'rgba(255,248,232,0.2)')
  glow.addColorStop(0.45, 'rgba(255,234,202,0.055)')
  glow.addColorStop(1, 'rgba(255,220,180,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, size, size)

  // 射线要柔：根数少一点、更长一段模糊、整体短一些，
  // 读起来才像大气里的散射，而不是镜头前套了一块星芒滤镜
  ctx.globalCompositeOperation = 'lighter'
  ctx.filter = 'blur(6px)'
  for (let i = 0; i < rayCount; i += 1) {
    const angle = (i / rayCount) * Math.PI * 2 + (random() - 0.5) * 0.3
    const length = c * rayLength * (0.45 + random() * 0.55)
    const x = c + Math.cos(angle) * length
    const y = c + Math.sin(angle) * length
    const strength = 0.5 + random() * 0.8

    const ray = ctx.createLinearGradient(c, c, x, y)
    ray.addColorStop(0, `rgba(255,252,246,${0.42 * strength})`)
    ray.addColorStop(0.22, `rgba(255,244,224,${0.26 * strength})`)
    ray.addColorStop(0.62, `rgba(255,232,198,${0.08 * strength})`)
    ray.addColorStop(1, 'rgba(255,222,180,0)')
    ctx.strokeStyle = ray
    ctx.lineWidth = 4 + random() * 11
    ctx.beginPath()
    ctx.moveTo(c + Math.cos(angle) * 10, c + Math.sin(angle) * 10)
    ctx.lineTo(x, y)
    ctx.stroke()
  }
  ctx.filter = 'none'

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

/** 月华：没有射线的柔光，只有一圈贴身的冷色光晕 */
function haloTexture() {
  return softGlowTexture([
    [0, 'rgba(236,245,255,0.9)'],
    [0.3, 'rgba(214,232,255,0.34)'],
    [0.62, 'rgba(190,214,250,0.08)'],
    [1, 'rgba(176,204,245,0)'],
  ])
}

/**
 * 月亮的本体：不能是一块死白的圆片。
 * 真实月亮有边缘变暗（临边昏暗）和几块深色月海，
 * 边缘再留 2~3% 的柔化，远看才是「天上的月亮」而不是贴上去的白点。
 */
function moonTexture() {
  const size = CELESTIAL_SIZE
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  const c = size / 2
  const radius = c * 0.86
  const random = mulberry32(731)

  ctx.save()
  ctx.beginPath()
  ctx.arc(c, c, radius, 0, Math.PI * 2)
  ctx.clip()

  // 底色：中心接近纯白，越靠边越冷、越暗
  const body = ctx.createRadialGradient(c, c, 0, c, c, radius)
  body.addColorStop(0, 'rgba(255,255,255,1)')
  body.addColorStop(0.6, 'rgba(246,250,255,1)')
  body.addColorStop(0.86, 'rgba(216,229,248,0.94)')
  body.addColorStop(1, 'rgba(178,198,228,0.78)')
  ctx.fillStyle = body
  ctx.fillRect(0, 0, size, size)

  // 月海：几团低透明度暗斑，稍微偏开中心，别做成同心圆靶子
  ctx.filter = 'blur(12px)'
  for (let i = 0; i < 7; i += 1) {
    const angle = random() * Math.PI * 2
    const dist = radius * (0.18 + random() * 0.6)
    const x = c + Math.cos(angle) * dist
    const y = c + Math.sin(angle) * dist
    const r = radius * (0.09 + random() * 0.16)
    ctx.fillStyle = `rgba(150,170,205,${0.1 + random() * 0.1})`
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.filter = 'none'
  ctx.restore()

  // 边缘软化：把最外 3% 擦成透明，避免出一圈硬像素锯齿
  ctx.globalCompositeOperation = 'destination-out'
  const soft = ctx.createRadialGradient(c, c, radius * 0.965, c, c, radius)
  soft.addColorStop(0, 'rgba(0,0,0,0)')
  soft.addColorStop(1, 'rgba(0,0,0,1)')
  ctx.fillStyle = soft
  ctx.beginPath()
  ctx.arc(c, c, radius, 0, Math.PI * 2)
  ctx.fill()

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

/**
 * 太阳 / 月亮。三层都用 Sprite：永远正对相机，不会被天空球切掉。
 * 颜色由 MonochromeRoad 按主题整体 tint，切换时一起变。
 */
function buildCelestial(kind) {
  const moon = kind === 'moon'

  // 太阳是过曝的白炽球，边缘一路晕开；月亮是有明确轮廓的圆盘
  const coreTexture = moon
    ? moonTexture()
    : discTexture([
        [0, 'rgba(255,255,255,1)'],
        [0.1, 'rgba(255,251,240,1)'],
        [0.24, 'rgba(255,238,206,0.92)'],
        [0.44, 'rgba(255,212,155,0.38)'],
        [1, 'rgba(255,190,130,0)'],
      ])
  // 太阳走带射线的光冕，月亮只要一圈干净的月华
  const sunCorona = coronaTexture(211, 17, 1.12)
  const softGlow = haloTexture()

  const sprite = (map, scale) => {
    const material = new THREE.SpriteMaterial({
      map,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: false,
      blending: THREE.AdditiveBlending,
      // 不加色调映射：太阳和月亮是场景里最亮的东西，
      // 走 NeutralToneMapping 会被压成一颗灰蓝的球，读不出「发光」
      toneMapped: false,
    })
    const object = new THREE.Sprite(material)
    object.scale.setScalar(scale)
    return object
  }

  // 三层：本体（决定轮廓）→ 光冕（射线）→ 外晕（弥散的光）。
  // 太阳的本体只有 42，剩下的亮度全交给外面两层，
  // 否则屏幕上就是一个边缘清楚的火球，没有光溢出来的感觉
  const core = sprite(coreTexture, moon ? 34 : 42)
  const glow = sprite(moon ? softGlow : sunCorona, moon ? 106 : 168)
  const halo = sprite(softGlow, moon ? 380 : 400)

  const root = new THREE.Group()
  root.add(halo, glow, core)
  // 初始方位只是个占位：真实位置每帧由 MonochromeRoad 按当前视线重新摆
  root.position.set(-120, 70, 620)
  return { root, core, glow, halo, kind }
}

/** 把实例放到曲线上：侧向偏移 + 随机朝向 */
function placeAt(curve, u, lateral, yaw, matrix, scale) {
  const frame = frameAt(curve, u)
  const position = frame.point.clone().addScaledVector(frame.right, lateral)
  // 树根埋进路肩一点，避免上坡时在坡面上悬空
  position.y -= 0.35

  const quaternion = new THREE.Quaternion().setFromAxisAngle(UP, yaw * Math.PI * 2)
  matrix.compose(position, quaternion, scale)
}

export function buildRoadside(curve, length) {
  const group = new THREE.Group()
  const random = mulberry32(20261021)
  const matrix = new THREE.Matrix4()

  // ---- 杉树：两侧都种，左侧留出灭点，所以左侧起步距离更远、密度更低 ----
  const treeGeometry = buildTreeGeometry()
  const treeMaterial = new THREE.MeshStandardMaterial({
    color: PALETTE.tree,
    roughness: 0.92,
    metalness: 0.04,
    // 树干/树冠共用材质，靠顶点色区分；再补一点自发光，
    // 否则夜里背光那侧的树会整片沉进黑背景，完全看不出轮廓。
    // 强度按主题给（森林最暗，需要更亮的 glow），切主题时一起插值。
    vertexColors: true,
    // 沙漠/海岸主题要把整批树淡出去，所以必须开透明；平时 opacity 就是 1
    transparent: true,
    emissive: PALETTE.tree,
    emissiveIntensity: themeProfile(0).treeGlow,
  })
  const treePositions = []
  const step = 11 / length
  for (let u = 0; u < 1; u += step) {
    for (const side of [-1, 1]) {
      const near = side > 0 ? 0.34 : 0.16
      if (random() > near) continue
      // 右侧画框立在 6.6m 处，树必须再往外退到 13m 之后，
      // 否则近处的树会长在画框前头，把照片整块挡住
      const lateral = side * (13 + random() * 14)
      const scale = 0.9 + random() * 1.1
      treePositions.push({ u, lateral, scale, yaw: random() })
    }
  }
  const trees = new THREE.InstancedMesh(treeGeometry, treeMaterial, treePositions.length)
  treePositions.forEach((item, index) => {
    placeAt(curve, item.u, item.lateral, item.yaw, matrix, new THREE.Vector3(item.scale, item.scale, item.scale))
    trees.setMatrixAt(index, matrix)
  })
  trees.instanceMatrix.needsUpdate = true
  trees.frustumCulled = false
  group.add(trees)

  // ---- 森林主题专属：再补一层更密、更近的杉树，平时整组隐藏 ----
  // 不重建几何，只切 visible + 透明度，主题切换时不会有一次性卡顿。
  // 材质必须和后一层分开：两层要各自淡入淡出，共用一个材质会一起消失
  const forestMaterial = treeMaterial.clone()
  forestMaterial.transparent = true
  const forestPositions = []
  for (let u = 0; u < 1; u += (7 / length)) {
    for (const side of [-1, 1]) {
      if (random() > (side > 0 ? 0.7 : 0.35)) continue
      forestPositions.push({ u, lateral: side * (12 + random() * 12), scale: 0.95 + random() * 0.85, yaw: random() })
    }
  }
  const forestTrees = new THREE.InstancedMesh(treeGeometry, forestMaterial, forestPositions.length)
  forestPositions.forEach((item, index) => {
    placeAt(curve, item.u, item.lateral, item.yaw, matrix, new THREE.Vector3(item.scale, item.scale, item.scale))
    forestTrees.setMatrixAt(index, matrix)
  })
  forestTrees.instanceMatrix.needsUpdate = true
  forestTrees.frustumCulled = false
  forestTrees.visible = false
  group.add(forestTrees)

  // ---- 沙漠主题专属：仙人掌替换杉树，稀疏地散在沙地上 ----
  // 和杉树一样只做 visible 开关 + 透明度插值：沙漠里一棵针叶树都不该出现
  const cactusGeometry = buildCactusGeometry()
  const cactusMaterial = new THREE.MeshStandardMaterial({
    color: 0x4f7a46,
    roughness: 0.88,
    metalness: 0.02,
    vertexColors: true,
    transparent: true,
    opacity: 0,
    // 沙漠地面很亮，仙人掌不带一点自发光会变成一根黑柱子
    emissive: 0x2c4426,
    emissiveIntensity: 0.35,
  })
  const cactusPositions = []
  for (let u = 0; u < 1; u += 17 / length) {
    for (const side of [-1, 1]) {
      if (random() > 0.4) continue
      cactusPositions.push({
        u,
        // 比杉树更靠外：近处的仙人掌不能挡住 6.6 米处的画框
        lateral: side * (10.5 + random() * 12),
        scale: 0.75 + random() * 0.8,
        yaw: random(),
      })
    }
  }
  const cacti = new THREE.InstancedMesh(cactusGeometry, cactusMaterial, cactusPositions.length)
  cactusPositions.forEach((item, index) => {
    placeAt(curve, item.u, item.lateral, item.yaw, matrix, new THREE.Vector3(item.scale, item.scale, item.scale))
    cacti.setMatrixAt(index, matrix)
  })
  cacti.instanceMatrix.needsUpdate = true
  cacti.frustumCulled = false
  cacti.visible = false
  group.add(cacti)

  // ---- 灌木 / 地被：森林、黎明、暮色、沙漠各有一层低矮植被 ----
  // 和树共用同一套色（bush 的颜色跟着 tree 插值），但必须有独立材质，
  // 否则灌木会跟着树的透明度一起被淡掉
  const bushMaterial = new THREE.MeshStandardMaterial({
    color: PALETTE.tree,
    roughness: 0.95,
    metalness: 0,
    vertexColors: true,
    transparent: true,
    opacity: 0,
    emissive: PALETTE.tree,
    emissiveIntensity: themeProfile(0).treeGlow * 0.8,
  })
  const bushPositions = []
  for (let u = 0; u < 1; u += 9 / length) {
    for (const side of [-1, 1]) {
      if (random() > 0.62) continue
      bushPositions.push({
        u,
        // 灌木比树更靠近路：路肩上先有一点东西，近景才不是一条空带子
        lateral: side * (8.2 + random() * 10.5),
        scale: 0.85 + random() * 0.9,
        yaw: random(),
      })
    }
  }
  const bushes = new THREE.InstancedMesh(buildBushGeometry(), bushMaterial, bushPositions.length)
  bushPositions.forEach((item, index) => {
    placeAt(curve, item.u, item.lateral, item.yaw, matrix, new THREE.Vector3(item.scale, item.scale, item.scale))
    bushes.setMatrixAt(index, matrix)
  })
  bushes.instanceMatrix.needsUpdate = true
  bushes.frustumCulled = false
  bushes.visible = false
  group.add(bushes)

  // ---- 大块岩石：山地 / 雪原 / 沙漠的体块，比碎石大一整号 ----
  const boulderMaterial = new THREE.MeshStandardMaterial({
    color: PALETTE.rock,
    roughness: 0.9,
    metalness: 0.06,
    flatShading: true,
    vertexColors: true,
    transparent: true,
    opacity: 0,
  })
  const boulderPositions = []
  for (let u = 0; u < 1; u += 23 / length) {
    for (const side of [-1, 1]) {
      if (random() > 0.5) continue
      boulderPositions.push({
        u,
        lateral: side * (11 + random() * 13),
        scale: 1.5 + random() * 2.2,
        yaw: random(),
      })
    }
  }
  const boulders = new THREE.InstancedMesh(
    buildBoulderGeometry(random),
    boulderMaterial,
    boulderPositions.length,
  )
  boulderPositions.forEach((item, index) => {
    placeAt(curve, item.u, item.lateral, item.yaw, matrix, new THREE.Vector3(item.scale, item.scale, item.scale))
    boulders.setMatrixAt(index, matrix)
  })
  boulders.instanceMatrix.needsUpdate = true
  boulders.frustumCulled = false
  boulders.visible = false
  group.add(boulders)

  // ---- 星空 / 落雪 / 太阳 / 月亮：只属于特定主题的天象 ----
  // 星空、太阳、月亮都由 MonochromeRoad 挂到天空球上，随相机一起走；
  // 白天主题用太阳、夜间主题用月亮，两者不会同时出现
  const starField = buildStarField()
  const snowField = buildSnowField()
  const sun = buildCelestial('sun')
  const moon = buildCelestial('moon')

  // ---- 碎石：贴着路肩散落，打破「一条光带」的干净边 ----
  const rockGeometry = new THREE.IcosahedronGeometry(0.6, 0)
  const rockMaterial = new THREE.MeshStandardMaterial({
    color: PALETTE.rock,
    roughness: 0.85,
    metalness: 0.1,
    flatShading: true,
  })
  const rockPositions = []
  for (let u = 0; u < 1; u += 14 / length) {
    for (const side of [-1, 1]) {
      if (random() > 0.55) continue
      rockPositions.push({
        u,
        lateral: side * (5.9 + random() * 7),
        scale: 0.5 + random() * 1.3,
        yaw: random(),
      })
    }
  }
  const rocks = new THREE.InstancedMesh(rockGeometry, rockMaterial, rockPositions.length)
  rockPositions.forEach((item, index) => {
    const scale = new THREE.Vector3(item.scale * 1.3, item.scale * 0.7, item.scale)
    placeAt(curve, item.u, item.lateral, item.yaw, matrix, scale)
    rocks.setMatrixAt(index, matrix)
  })
  rocks.instanceMatrix.needsUpdate = true
  rocks.frustumCulled = false
  group.add(rocks)

  // ---- 中央虚线：白路面上唯一的中灰物件，车速最快时就靠它读出来 ----
  const dashGeometry = new THREE.BoxGeometry(0.15, 0.012, 3.4)
  const dashMaterial = new THREE.MeshBasicMaterial({ color: PALETTE.dash })
  const dashCount = Math.max(2, Math.round(length / 9))
  const dashes = new THREE.InstancedMesh(dashGeometry, dashMaterial, dashCount)
  const basis = new THREE.Matrix4()
  const scale = new THREE.Vector3(1, 1, 1)
  for (let i = 0; i < dashCount; i += 1) {
    const u = i / dashCount
    const frame = frameAt(curve, u)
    const up = new THREE.Vector3().crossVectors(frame.tangent, frame.right).normalize()
    basis.makeBasis(frame.right, up, frame.tangent)
    const quaternion = new THREE.Quaternion().setFromRotationMatrix(basis)
    const position = frame.point.clone()
    position.y += 0.006
    matrix.compose(position, quaternion, scale)
    dashes.setMatrixAt(i, matrix)
  }
  dashes.instanceMatrix.needsUpdate = true
  dashes.frustumCulled = false
  group.add(dashes)

  // 主题淡入淡出统一登记：切主题时按 when 决定这一层该不该出现，
  // material[key] 从当前值插到 0 或 1（海面那种走 uniform 的，key 就是 'value'）
  const fadeLayers = [
    { when: 'trees', object: trees, material: treeMaterial, key: 'opacity' },
    { when: 'forest', object: forestTrees, material: forestMaterial, key: 'opacity' },
    { when: 'cacti', object: cacti, material: cactusMaterial, key: 'opacity' },
    { when: 'bushes', object: bushes, material: bushMaterial, key: 'opacity' },
    { when: 'boulders', object: boulders, material: boulderMaterial, key: 'opacity' },
    { when: 'stars', object: starField.points, material: starField.material, key: 'opacity' },
    { when: 'snowfall', object: snowField.points, material: snowField.material, key: 'opacity' },
    // 天象三层各自淡入淡出：本体最亮，光冕次之，外晕最淡。
    // max 是该层完全出现时的目标透明度，别让外晕和本体一样实
    { when: 'sun', object: sun.root, material: sun.core.material, key: 'opacity', max: 1 },
    { when: 'sun', object: sun.root, material: sun.glow.material, key: 'opacity', max: 1 },
    { when: 'sun', object: sun.root, material: sun.halo.material, key: 'opacity', max: 0.42 },
    { when: 'moon', object: moon.root, material: moon.core.material, key: 'opacity', max: 1 },
    { when: 'moon', object: moon.root, material: moon.glow.material, key: 'opacity', max: 0.78 },
    { when: 'moon', object: moon.root, material: moon.halo.material, key: 'opacity', max: 0.34 },
  ]

  group.userData = {
    treeMaterial,
    forestMaterial,
    forestTrees,
    trees,
    cactusMaterial,
    cacti,
    bushMaterial,
    bushes,
    boulderMaterial,
    boulders,
    rockMaterial,
    treeGeometry,
    starField,
    snowField,
    sun,
    moon,
    fadeLayers,
  }
  return group
}
