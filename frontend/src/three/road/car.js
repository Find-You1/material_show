import * as THREE from 'three'
import { PALETTE } from './config'

/**
 * 程序化跑车：没有外部模型文件。
 *
 * 车身与座舱各是一条「放样体」——沿车长排一串截面，
 * 截面的圆角矩形按高度收窄，再缝成一张连续曲面，
 * 所以侧面是流线、正面是上窄下宽的腰身，不再是几个盒子拼起来。
 * 车头朝向本地 +Z，车轮落在 y = 0。
 */

// 截面：给定半宽与上下沿，画一圈圆角矩形（squareness 越大越接近矩形）
function ringPoints({ halfWidth, bottom, top }, segments, squareness) {
  const centerY = (bottom + top) / 2
  const radiusY = (top - bottom) / 2
  const points = []

  for (let i = 0; i < segments; i += 1) {
    const t = (i / segments) * Math.PI * 2
    const c = Math.cos(t)
    const s = Math.sin(t)
    const x = halfWidth * Math.sign(c) * Math.pow(Math.abs(c), 2 / squareness)
    const y = centerY + radiusY * Math.sign(s) * Math.pow(Math.abs(s), 2 / squareness)
    points.push([x, y])
  }

  return points
}

function loftGeometry(stations, { segments = 28, squareness = 4 } = {}) {
  const positions = []
  const indices = []
  const rings = stations.map((station) => ringPoints(station, segments, squareness))

  for (let i = 0; i < stations.length; i += 1) {
    const { z } = stations[i]
    for (const [x, y] of rings[i]) positions.push(x, y, z)
  }

  for (let i = 0; i < stations.length - 1; i += 1) {
    for (let j = 0; j < segments; j += 1) {
      const j2 = (j + 1) % segments
      const a = i * segments + j
      const b = i * segments + j2
      const c = (i + 1) * segments + j2
      const d = (i + 1) * segments + j
      // 截面沿 -Z 推进，绕序要反过来才能让法线朝外
      indices.push(a, d, b, b, d, c)
    }
  }

  // 首尾封口：前端朝 +Z，尾端朝 -Z
  const first = stations[0]
  const frontCenter = positions.length / 3
  positions.push(0, (first.bottom + first.top) / 2, first.z)
  for (let j = 0; j < segments; j += 1) {
    const j2 = (j + 1) % segments
    indices.push(frontCenter, j, j2)
  }

  const last = stations[stations.length - 1]
  const offset = (stations.length - 1) * segments
  const rearCenter = positions.length / 3
  positions.push(0, (last.bottom + last.top) / 2, last.z)
  for (let j = 0; j < segments; j += 1) {
    const j2 = (j + 1) % segments
    indices.push(rearCenter, offset + j2, offset + j)
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function createGlowTexture(inner = 'rgba(255,255,255,0.95)', outer = 'rgba(255,255,255,0)') {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  gradient.addColorStop(0, inner)
  gradient.addColorStop(0.45, 'rgba(255,255,255,0.32)')
  gradient.addColorStop(1, outer)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

// 车身截面：轮拱处略收、后轮上方外扩成宽臀；尾部收窄收低，形成鸭尾
const BODY_STATIONS = [
  { z: 2.3, halfWidth: 0.56, bottom: 0.3, top: 0.58 },
  { z: 2.12, halfWidth: 0.8, bottom: 0.28, top: 0.7 },
  { z: 1.85, halfWidth: 0.9, bottom: 0.26, top: 0.8 },
  { z: 1.45, halfWidth: 0.89, bottom: 0.25, top: 0.88 },
  { z: 0.9, halfWidth: 0.92, bottom: 0.25, top: 0.93 },
  { z: 0.2, halfWidth: 0.92, bottom: 0.25, top: 0.96 },
  { z: -0.55, halfWidth: 0.93, bottom: 0.26, top: 0.98 },
  { z: -1.1, halfWidth: 0.93, bottom: 0.26, top: 0.99 },
  { z: -1.55, halfWidth: 0.88, bottom: 0.27, top: 0.99 },
  { z: -1.85, halfWidth: 0.94, bottom: 0.29, top: 0.97 },
  { z: -2.1, halfWidth: 0.9, bottom: 0.32, top: 0.93 },
  { z: -2.3, halfWidth: 0.82, bottom: 0.36, top: 0.87 },
  { z: -2.36, halfWidth: 0.66, bottom: 0.42, top: 0.8 },
]

// 座舱：前挡从风挡下沿一路爬升，车顶平，后窗滑进尾部。
// 顶线压到 1.26 以内，车高才读得出「低趴」；宽高比收窄，侧面不再是方块。
const CABIN_STATIONS = [
  { z: 1.0, halfWidth: 0.58, bottom: 0.9, top: 0.99 },
  { z: 0.72, halfWidth: 0.67, bottom: 0.92, top: 1.06 },
  { z: 0.4, halfWidth: 0.7, bottom: 0.93, top: 1.19 },
  { z: 0.05, halfWidth: 0.7, bottom: 0.94, top: 1.26 },
  { z: -0.5, halfWidth: 0.68, bottom: 0.95, top: 1.26 },
  { z: -1.0, halfWidth: 0.63, bottom: 0.96, top: 1.21 },
  { z: -1.35, halfWidth: 0.56, bottom: 0.97, top: 1.12 },
  { z: -1.68, halfWidth: 0.45, bottom: 0.98, top: 1.02 },
  { z: -1.85, halfWidth: 0.35, bottom: 0.99, top: 0.99 },
]

/** 车牌贴图：白底 + 黑字 + 一圈深色边框，够小但一眼能认出是牌照 */
function createPlateTexture(text) {
  const canvas = document.createElement('canvas')
  // 512×148 是 256×74 的两倍：车牌只占画面几十像素，贴图不够密就会被
  // mipmap 糊成一团白点，字完全读不出
  canvas.width = 512
  canvas.height = 148
  const ctx = canvas.getContext('2d')

  ctx.fillStyle = '#e9e9ec'
  ctx.fillRect(0, 0, 512, 148)
  ctx.strokeStyle = '#2a2a2e'
  ctx.lineWidth = 9
  ctx.strokeRect(4.5, 4.5, 503, 139)

  ctx.fillStyle = '#111216'
  // 10 个字符，76px 刚好左右各留 30px 边
  ctx.font = '700 76px "Helvetica Neue", Arial, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 256, 80)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8
  return texture
}

function buildWheel(tireMat, rimMat, brakeMat) {
  const wheel = new THREE.Group()

  const tireGeometry = new THREE.CylinderGeometry(0.46, 0.46, 0.32, 30)
  tireGeometry.rotateZ(Math.PI / 2)
  const tire = new THREE.Mesh(tireGeometry, tireMat)
  tire.castShadow = true
  wheel.add(tire)

  // 轮胎两侧的圆肩，让黑轮子不再是一片平筒
  const shoulderGeometry = new THREE.TorusGeometry(0.375, 0.086, 8, 26)
  shoulderGeometry.rotateY(Math.PI / 2)
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Mesh(shoulderGeometry, tireMat)
    shoulder.position.x = side * 0.112
    wheel.add(shoulder)
  }

  // 刹车盘：从轮辐缝里透出来的暗色圆片
  const discGeometry = new THREE.CylinderGeometry(0.29, 0.29, 0.03, 24)
  discGeometry.rotateZ(Math.PI / 2)
  const disc = new THREE.Mesh(discGeometry, brakeMat)
  disc.position.x = 0.04
  wheel.add(disc)

  // 轮辋：外圈 + 五根辐条 + 轮毂
  const ringGeometry = new THREE.TorusGeometry(0.282, 0.03, 8, 28)
  ringGeometry.rotateY(Math.PI / 2)
  const spokeGeometry = new THREE.BoxGeometry(0.034, 0.53, 0.052)
  const hubGeometry = new THREE.CylinderGeometry(0.075, 0.075, 0.36, 16)
  hubGeometry.rotateZ(Math.PI / 2)
  wheel.add(new THREE.Mesh(hubGeometry, rimMat))

  for (const side of [-1, 1]) {
    const ring = new THREE.Mesh(ringGeometry, rimMat)
    ring.position.x = side * 0.152
    wheel.add(ring)

    for (let i = 0; i < 5; i += 1) {
      const spoke = new THREE.Mesh(spokeGeometry, rimMat)
      spoke.position.x = side * 0.155
      spoke.rotation.x = (i / 5) * Math.PI
      wheel.add(spoke)
    }
  }

  return wheel
}

export function buildCar() {
  const car = new THREE.Group()

  // 车漆要读成黑：粗糙度拉高、清漆与环境反射都压住，
  // 否则顶面会被主光刷成中灰 —— 黑车一旦发灰，整台车就像塑料模型
  const paintMat = new THREE.MeshPhysicalMaterial({
    color: PALETTE.carBody,
    roughness: 0.6,
    metalness: 0.14,
    clearcoat: 0.2,
    clearcoatRoughness: 0.62,
    envMapIntensity: 0.1,
  })
  // 玻璃必须是深色面：清漆和低粗糙度会让车顶把主光整片反成灰，
  // 远看就是一块浅色枕头。粗糙度压住高光，只留一道很淡的边缘光。
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: PALETTE.carGlass,
    roughness: 0.42,
    metalness: 0.08,
    envMapIntensity: 0.18,
  })
  const trimMat = new THREE.MeshStandardMaterial({
    color: PALETTE.carTrim,
    roughness: 0.6,
    metalness: 0.35,
  })
  const rimMat = new THREE.MeshStandardMaterial({
    color: 0x8f959d,
    roughness: 0.3,
    metalness: 0.88,
    envMapIntensity: 0.7,
  })
  const brakeMat = new THREE.MeshStandardMaterial({
    color: 0x24262a,
    roughness: 0.75,
    metalness: 0.5,
  })
  const tireMat = new THREE.MeshStandardMaterial({
    color: 0x050506,
    roughness: 0.95,
    metalness: 0.03,
  })
  // 尾翼用高光碳纤：黑漆车身上全黑会糊成一团，只有镜面反光能勾出翼面轮廓
  const carbonMat = new THREE.MeshStandardMaterial({
    color: 0x17181c,
    roughness: 0.24,
    metalness: 0.7,
    envMapIntensity: 0.9,
  })

  // ---- 车身与座舱 ----
  const body = new THREE.Mesh(loftGeometry(BODY_STATIONS, { segments: 30, squareness: 4.2 }), paintMat)
  body.castShadow = true
  car.add(body)

  const cabin = new THREE.Mesh(
    loftGeometry(CABIN_STATIONS, { segments: 30, squareness: 3 }),
    glassMat,
  )
  cabin.castShadow = true
  car.add(cabin)

  // ---- 轮拱与轮子 ----
  const wheelZ = [1.5, -1.5]
  // 轮子往里收到 0.84：轮胎外沿正好和车宽齐平，不再像四块板子贴在车侧
  const wheelX = 0.84

  // 半圆轮眉：比轮胎外沿再鼓出一点的亮边，轮子才像嵌进拱里而不是贴在车侧
  const fenderGeometry = new THREE.TorusGeometry(0.56, 0.07, 8, 28, Math.PI)
  fenderGeometry.rotateY(Math.PI / 2)

  const wheels = []
  for (const z of wheelZ) {
    for (const side of [-1, 1]) {
      const fender = new THREE.Mesh(fenderGeometry, paintMat)
      fender.position.set(side * 0.98, 0.46, z)
      car.add(fender)

      const wheel = buildWheel(tireMat, rimMat, brakeMat)
      wheel.position.set(side * wheelX, 0.46, z)
      car.add(wheel)
      wheels.push(wheel)
    }
  }
  car.userData.wheels = wheels
  car.userData.paintMaterial = paintMat

  // ---- 空气动力件 ----
  const splitter = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.05, 0.3), trimMat)
  splitter.position.set(0, 0.29, 2.24)
  car.add(splitter)

  // 尾翼：加宽加高，两侧再立端板。从车后和侧后方都能看到一道明显的横线，
  // 而不是一片贴在尾箱上看不见的鸭尾
  const wingBlade = new THREE.Mesh(new THREE.BoxGeometry(1.94, 0.05, 0.37), carbonMat)
  wingBlade.position.set(0, 1.16, -2.02)
  wingBlade.rotation.x = -0.14
  wingBlade.castShadow = true
  car.add(wingBlade)
  for (const side of [-1, 1]) {
    const stand = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.31, 0.14), carbonMat)
    stand.position.set(side * 0.5, 0.98, -2.02)
    car.add(stand)

    // 端板：飞机翼尖那样的竖片，尾翼才不是一根悬空的横杆
    const endplate = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.3, 0.46), carbonMat)
    endplate.position.set(side * 0.97, 1.15, -2.02)
    endplate.rotation.x = -0.14
    car.add(endplate)
  }

  // 扩散器：尾部的黑色导流片
  const diffuser = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.1, 0.42), trimMat)
  diffuser.position.set(0, 0.32, -2.18)
  car.add(diffuser)
  for (let i = -2; i <= 2; i += 1) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.13, 0.34), trimMat)
    fin.position.set(i * 0.28, 0.33, -2.2)
    car.add(fin)
  }

  // 侧裙：把车身下沿和地面之间填上，车不再像悬空
  for (const side of [-1, 1]) {
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 2.0), trimMat)
    skirt.position.set(side * 0.86, 0.32, 0)
    car.add(skirt)
  }

  // 后视镜：支杆 + 镜壳
  for (const side of [-1, 1]) {
    const stalk = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.025, 0.045), trimMat)
    stalk.position.set(side * 0.82, 0.92, 0.6)
    car.add(stalk)

    const shell = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.055, 0.085), paintMat)
    shell.position.set(side * 0.9, 0.94, 0.58)
    car.add(shell)
  }

  // 排气：两根小圆管
  const exhaustGeometry = new THREE.CylinderGeometry(0.05, 0.05, 0.1, 14)
  exhaustGeometry.rotateX(Math.PI / 2)
  for (const side of [-1, 1]) {
    const exhaust = new THREE.Mesh(exhaustGeometry, rimMat)
    exhaust.position.set(side * 0.36, 0.4, -2.3)
    car.add(exhaust)
  }

  // ---- 尾焰 ----
  // 两团叠加混合的锥体，底口贴在排气管上、尖端朝后。
  // 几何始终不变，每帧只抖缩放和不透明度（见 MonochromeRoad.#updateCar），
  // 这样既不会重建几何，也不会和泛光抢阈值之外的亮度。
  const flames = []
  // 摄像机跟在车后，锥形尾焰是端面朝你的，只靠锥体看起来像两个橙点；
  // 叠一层暖色光晕（Sprite 永远正对相机）才读得出是火
  const glowTexture = createGlowTexture('rgba(255,246,214,1)', 'rgba(180,60,10,0)')
  for (const side of [-1, 1]) {
    const flameGeometry = new THREE.ConeGeometry(0.12, 0.92, 14, 1, true)
    // 锥体默认沿 +Y，先转到 -Z，再把底口挪到原点，尖端自然朝后
    flameGeometry.rotateX(-Math.PI / 2)
    flameGeometry.translate(0, 0, -0.46)

    const flame = new THREE.Mesh(
      flameGeometry,
      new THREE.MeshBasicMaterial({
        // 3.2 的亮度刚好越过泛光阈值，焰尖会自己晕开一圈
        color: new THREE.Color(3.2, 1.5, 0.42),
        transparent: true,
        opacity: 0.75,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    )
    flame.position.set(side * 0.36, 0.4, -2.34)
    flame.renderOrder = 3
    car.add(flame)

    // 光晕挂在火焰后方一点：正对相机，从车后看就是两团跳动的橙光
    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture,
        color: 0xffffff,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    )
    glow.position.set(side * 0.36, 0.42, -2.5)
    glow.scale.setScalar(0.78)
    glow.renderOrder = 4
    car.add(glow)

    flames.push(flame, glow)
  }
  car.userData.flames = flames

  // ---- 灯光 ----
  // 尾灯必须落在车尾封口面之外（z 比 -2.36 更负），否则会被壳体整块挡住
  const tailPanel = new THREE.Mesh(new THREE.BoxGeometry(1.32, 0.17, 0.05), trimMat)
  tailPanel.position.set(0, 0.76, -2.37)
  car.add(tailPanel)

  // 贯穿式尾灯：细一道，亮度刚过泛光阈值，像一条 LED 灯带而不是镀铬保险杠
  const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.75, 2.75, 2.9) })
  const tailBar = new THREE.Mesh(new THREE.BoxGeometry(1.26, 0.022, 0.03), lampMat)
  tailBar.position.set(0, 0.78, -2.4)
  car.add(tailBar)

  // 车牌：白底黑字的贴图平面，挂在尾灯下方。车一直在动，
  // 这是唯一能让人读出「这是一辆具体的车」的细节。
  // 尺寸比真车牌略大一点：13.5 米外的车尾只有一百多像素宽，
  // 按真实 0.52m 做出来刚好糊成一条白线
  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(0.62, 0.18),
    new THREE.MeshBasicMaterial({ map: createPlateTexture('lzxiang814'), toneMapped: false }),
  )
  plate.position.set(0, 0.62, -2.4)
  plate.rotation.y = Math.PI
  car.add(plate)

  const headGlowTexture = createGlowTexture()
  for (const side of [-1, 1]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.05, 0.03), lampMat)
    head.position.set(side * 0.5, 0.63, 2.2)
    car.add(head)

    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(0.7, 0.32),
      new THREE.MeshBasicMaterial({
        map: headGlowTexture,
        transparent: true,
        opacity: 0.28,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    )
    glow.position.set(side * 0.5, 0.63, 2.23)
    car.add(glow)
  }

  // ---- 落地阴影（实时光照投不出来的近距离接触阴影）----
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 5.1),
    new THREE.MeshBasicMaterial({
      map: createGlowTexture('rgba(0,0,0,0.66)', 'rgba(0,0,0,0)'),
      transparent: true,
      depthWrite: false,
    }),
  )
  shadow.rotation.x = -Math.PI / 2
  shadow.position.y = 0.012
  car.add(shadow)

  return car
}
