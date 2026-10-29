import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'

import { CAMERA, MOTION, PALETTE, THEMES, themePalette, themeProfile } from './config'
import { createRoadCurve, frameAt, UP, wrap01 } from './path'
import { buildPosts, buildRoad } from './road'
import { buildGround } from './terrain'
import { buildSky } from './sky'
import { buildCar } from './car'
import { buildBoards } from './boards'
import { buildRoadside } from './props'
import { buildCoast } from './coast'

const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

// 画框四角在平面局部坐标里的符号组合
const CORNERS = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
]

/**
 * 3D 山路片场的总装。
 *
 * - 世界：白色路面 + 黑色边石 + 两侧护栏，白色低面数远山沉在黑雾里；
 * - 车：程序化黑色跑车，沿闭合山路匀速前进，车身跟着切线转向；
 * - 相机：吊在车后偏右，近处路面落在左下、远处收束到右上；
 * - 画框：沿路左右交替，每帧只绕 Y 轴转向相机，照片始终面向屏幕；
 * - 点击：相机沿视线推进到画框前，再把画框的屏幕矩形交给放映层做转场。
 */
export class MonochromeRoad {
  constructor(host, { items = [], onSelect, onReady, onTheme } = {}) {
    this.host = host
    this.onSelect = onSelect || (() => {})
    this.onReady = onReady || (() => {})
    this.onTheme = onTheme || (() => {})
    this.items = items

    this.disposed = false
    this.mode = 'follow'
    this.elapsed = 0
    this.carU = 0
    this.speed = MOTION.speed
    this.hold = false
    this.inView = true
    this.hover = null
    this.pointer = new THREE.Vector2(-2, -2)
    this.raycaster = new THREE.Raycaster()
    // 画框屏幕判定的临时向量，避免每帧给每块画框都 new 一个
    this.corner = new THREE.Vector3()
    this.fly = null
    this.returning = null

    // 拖拽环视：yaw/pitch 跟随指针，松手后回零
    this.drag = null
    this.suppressClick = false
    this.orbit = { yaw: 0, pitch: 0, targetYaw: 0, targetPitch: 0 }

    // 主题（山路 / 雪地 / 森林 / …）：只改颜色，几何完全不动。
    // 没人操作时自动轮播（见 #loop）；闪动的真凶是后处理链（已移除），
    // 0.9s 的颜色插值本身是平滑的
    this.themeIndex = 0
    this.themeAnim = null
    // 距上一次换主题过了多少秒：到 MOTION.themeInterval 就自动切下一套
    this.themeClock = 0

    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(PALETTE.background)
    this.scene.fog = new THREE.Fog(PALETTE.fog, 20, 170)

    this.camera = new THREE.PerspectiveCamera(CAMERA.fov, 1, CAMERA.near, CAMERA.far)

    this.renderer = new THREE.WebGLRenderer({
      // 直接画到默认帧缓冲，MSAA 由这里负责（见下方为什么要放弃后处理）
      antialias: true,
      powerPreference: 'high-performance',
      // 保留绘制缓冲：合成器有时会在下一帧还没画好时重取一次画面，
      // 关掉它就会拿到已清空的缓冲，整块 canvas 一瞬间变黑
      preserveDrawingBuffer: true,
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    // Neutral 比 ACES 更能保住白色：路面自发光拉满也不会被压成浅灰
    this.renderer.toneMapping = THREE.NeutralToneMapping
    this.renderer.toneMappingExposure = 1.12
    // 阴影整段关掉：主光每帧跟着相机走，阴影贴图的纹素网格每帧都在挪，
    // 车与路面上的阴影边缘就会持续「爬」；而路面本身靠自发光读白，
    // 遮掉直射光几乎看不出差别 —— 这层开销换来的只有满屏细碎闪动。
    this.renderer.shadowMap.enabled = false
    this.renderer.domElement.style.display = 'block'
    this.renderer.domElement.style.width = '100%'
    this.renderer.domElement.style.height = '100%'
    this.renderer.domElement.style.touchAction = 'manipulation'
    host.appendChild(this.renderer.domElement)

    // 不使用 EffectComposer 后处理链：
    // 只要经过「离屏 render target → 全屏 pass → 默认帧缓冲」这条路径，
    // 合成器就会间歇性地整帧拿不到内容（实测 3~7 帧/16 帧整块 canvas 变黑，
    // 只剩 DOM 上的白字）。直出到默认帧缓冲 48 帧 0 次黑屏，
    // 而且省掉一张 4x MSAA 的 HalfFloat target 与五级模糊，GPU 压力小得多。

    this.loader = new THREE.TextureLoader()
    this.loader.setCrossOrigin('anonymous')

    this.#buildEnvironment()
    this.#buildLights()
    this.#buildWorld()
    // 首屏也要走一遍主题：树、岩石、落雪、日月这些「按主题出现」的层默认透明度是 0，
    // 不在这里点一次，开场就是一套没有陈设的空路（要等 20 秒自动轮播才补上）
    this.setTheme(0)
    this.#bindEvents()

    this.reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    this.paused = false

    this.resize()
    this.#applyFollow()
    this.#renderOnce()
    this.onReady()

    this.lastTime = 0
    // 必须走 rAF：直接调用会拿到 undefined 的时间戳，dt 变 NaN，整条曲线就废了
    this.raf = requestAnimationFrame(this.#loop)
  }

  // ---------- 组装 ----------
  #buildEnvironment() {
    const pmrem = new THREE.PMREMGenerator(this.renderer)
    this.envTarget = pmrem.fromScene(new RoomEnvironment(), 0.04)
    this.scene.environment = this.envTarget.texture
    this.scene.environmentIntensity = 0.42
    pmrem.dispose()
  }

  #buildLights() {
    const hemi = new THREE.HemisphereLight(0xffffff, 0x111114, 1.0)
    this.scene.add(hemi)

    // 主光跟相机走：无论车开到哪一段，白色路面始终有同一方向的立体感。
    // 路面的白主要靠自发光，所以这里不需要把强度推高 —— 推高了车顶会反光成灰片。
    this.keyLight = new THREE.DirectionalLight(0xffffff, 2.6)
    this.keyLight.target.position.set(0, 0, 0)
    this.keyLight.castShadow = true
    this.keyLight.shadow.mapSize.set(2048, 2048)
    this.keyLight.shadow.camera.near = 1
    this.keyLight.shadow.camera.far = 90
    this.keyLight.shadow.camera.left = -26
    this.keyLight.shadow.camera.right = 26
    this.keyLight.shadow.camera.top = 26
    this.keyLight.shadow.camera.bottom = -26
    this.keyLight.shadow.bias = -0.0004
    this.scene.add(this.keyLight)
    this.scene.add(this.keyLight.target)

    this.fillLight = new THREE.DirectionalLight(0xd8dce4, 0.7)
    this.scene.add(this.fillLight)
    this.scene.add(this.fillLight.target)
  }

  #buildWorld() {
    this.curve = createRoadCurve()
    this.length = this.curve.getLength()

    this.world = new THREE.Group()
    this.scene.add(this.world)

    this.sky = buildSky()
    this.scene.add(this.sky)

    this.ground = buildGround()
    this.world.add(this.ground)
    this.road = buildRoad(this.curve)
    this.road.traverse((object) => {
      if (object.isMesh) object.receiveShadow = true
    })
    this.world.add(this.road)
    this.world.add(buildPosts(this.curve, this.length))
    this.props = buildRoadside(this.curve, this.length)
    this.world.add(this.props)

    // 星空 / 落雪 / 太阳 / 月亮挂在天空球上：球每帧跟着相机走，
    // 它们就永远停在「无限远」，车开到哪里都在头顶
    const { starField, snowField, sun, moon } = this.props.userData
    this.sky.add(starField.points, snowField.points, sun.root, moon.root)
    this.snow = snowField
    this.sunBody = sun
    this.moonBody = moon

    // 海岸专属：沙滩 + 动态海面。整组默认隐藏，只有 Coast 主题打开
    this.coast = buildCoast(this.curve)
    this.world.add(this.coast)

    this.car = buildCar()
    this.car.traverse((object) => {
      if (object.isMesh && !object.material.transparent) object.castShadow = true
    })
    this.world.add(this.car)

    this.#buildBoards()
  }

  #buildBoards() {
    if (this.boardsResult) {
      this.world.remove(this.boardsResult.root)
      this.#disposeBoards(this.boardsResult)
      this.boardsResult = null
      this.boards = []
      this.planeMeshes = []
    }

    this.boardsResult = buildBoards({
      curve: this.curve,
      length: this.length,
      items: this.items,
      loader: this.loader,
      anisotropy: this.renderer.capabilities.getMaxAnisotropy(),
    })

    this.world.add(this.boardsResult.root)
    this.boards = this.boardsResult.boards || []
    this.planeMeshes = this.boards.map((board) => board.plane)
  }

  #disposeBoards(result) {
    result.textures?.forEach((texture) => texture.dispose())
    result.materials?.forEach((material) => material.dispose())
    result.borderMaterials?.forEach((material) => material.dispose())
    result.photoMaterials?.forEach((material) => material.dispose())
    result.postMaterials?.forEach((material) => material.dispose())
    result.geometries?.forEach((geometry) => geometry.dispose())
    result.frameMaterial?.dispose()
    result.postMaterial?.dispose()
  }

  // ---------- 相机动线 ----------
  #applyFollow() {
    const pose = this.#followPose()
    this.camera.position.copy(pose.position)
    this.camera.quaternion.copy(pose.quaternion)
  }

  #followPose() {
    const back = frameAt(this.curve, this.carU - CAMERA.backDistance / this.length)
    const carFrame = frameAt(this.curve, this.carU)
    const ahead = frameAt(this.curve, this.carU + CAMERA.lookAhead / this.length)

    const base = back.point.clone().addScaledVector(back.right, CAMERA.lateral)
    base.y += CAMERA.height

    const lookAheadPoint = ahead.point.clone().addScaledVector(ahead.right, CAMERA.lookLateral)
    lookAheadPoint.y += CAMERA.lookHeight

    const { yaw, pitch } = this.orbit
    const position = base.clone()
    let look = lookAheadPoint

    if (yaw || pitch) {
      // 绕车身转，而不是原地转头：这样拖拽时能看到车的侧面和后方
      const pivot = carFrame.point.clone()
      pivot.y += 0.9
      const offset = base.clone().sub(pivot)
      offset.applyAxisAngle(UP, yaw)
      offset.y += pitch * 5.2
      position.copy(pivot).add(offset)

      // 视线随拖拽往车身收，松开后自然交还前方路面
      const weight = Math.min(1, Math.abs(yaw) / MOTION.orbitYaw)
      const carLook = pivot.clone()
      carLook.y -= 0.4
      look = lookAheadPoint.lerp(carLook, weight)
    }

    const matrix = new THREE.Matrix4().lookAt(position, look, UP)
    return { position, quaternion: new THREE.Quaternion().setFromRotationMatrix(matrix) }
  }

  #updateOrbit(dt) {
    const k = 1 - Math.exp(-7 * dt)
    this.orbit.yaw += (this.orbit.targetYaw - this.orbit.yaw) * k
    this.orbit.pitch += (this.orbit.targetPitch - this.orbit.pitch) * k
  }

  // ---------- 每帧 ----------
  #updateCar(dt = 0) {
    const frame = frameAt(this.curve, this.carU)
    this.car.position.copy(frame.point)
    this.car.position.y += Math.sin(this.elapsed * 5.2) * 0.012

    const left = new THREE.Vector3().crossVectors(UP, frame.tangent).normalize()
    const up = new THREE.Vector3().crossVectors(frame.tangent, left).normalize()
    const basis = new THREE.Matrix4().makeBasis(left, up, frame.tangent)
    this.car.quaternion.setFromRotationMatrix(basis)

    // 轮胎跟着车速滚：轮子半径 0.46m
    const wheels = this.car.userData.wheels
    if (wheels && dt) {
      const spin = (this.speed * dt) / 0.46
      for (const wheel of wheels) wheel.rotation.x += spin
    }

    // 尾焰：几何不变，只抖缩放与不透明度。两个 mesh，成本可以忽略。
    // 频率压到 8~12Hz 以下：叠加色 30Hz 的跳动在画面正中看起来就是闪烁，
    // 而不是「火在烧」
    const flames = this.car.userData.flames
    if (flames) {
      for (let i = 0; i < flames.length; i += 1) {
        const flame = flames[i]
        const t = this.elapsed
        const breath = 0.5 + 0.5 * Math.sin(t * 8.5 + i * 2.3)
        const width = 0.88 + breath * 0.1
        flame.scale.set(width, width, 0.9 + Math.sin(t * 12.5 + i * 1.7) * 0.12)
        flame.material.opacity = 0.66 + breath * 0.16
      }
    }
  }

  #updateBoards() {
    if (!this.boards.length) return
    const camera = this.camera.position
    const cull = this.mode === 'follow'

    // 投影判定要用相机矩阵本身，不能等到 renderer.render() 里才更新
    this.camera.updateMatrixWorld()

    for (const board of this.boards) {
      const face = board.face
      face.lookAt(camera.x, face.position.y, camera.z)
      // 只看「是否还占着屏幕」：整块都在视口外才剔除。
      // 用距离做剔除永远会闪 —— 13 米一个画框、16m/s 下每 0.8 秒就有
      // 一块在画面里凭空出现/消失；而按投影判定，剔除发生在完全看不见的那一帧，
      // 没有任何一像素的跳变。照片也因此可以保持不透明。
      face.visible = !cull || this.#onScreen(board)
    }
  }

  /** 画框四角投影后是否与视口相交（含「已跑到相机身后」） */
  #onScreen(board) {
    const plane = board.plane
    const camera = this.camera
    // lookAt 只改了朝向，矩阵要在这里重算，否则判定用的是上一帧的位置
    board.face.updateMatrixWorld(true)

    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity

    for (const [sx, sy] of CORNERS) {
      this.corner
        .set((sx * board.width) / 2, (sy * board.height) / 2, 0)
        .applyMatrix4(plane.matrixWorld)
        .applyMatrix4(camera.matrixWorldInverse)

      // 相机空间里 z 为负才在前方；有任何一角进到 1.5m 以内就整块不要，
      // 否则会出现「贴着镜头的一块大照片」占半屏
      if (this.corner.z > -1.5) return false

      this.corner.applyMatrix4(camera.projectionMatrix)
      minX = Math.min(minX, this.corner.x)
      maxX = Math.max(maxX, this.corner.x)
      minY = Math.min(minY, this.corner.y)
      maxY = Math.max(maxY, this.corner.y)
    }

    return !(maxX < -1 || minX > 1 || maxY < -1 || minY > 1)
  }

  #updateLights() {
    const camera = this.camera.position
    // 天空球跟着相机走，避免远处的球壁产生视差
    if (this.sky) this.sky.position.copy(camera)

    // 太阳 / 月亮是天空球的子节点（局部坐标＝相对相机的世界轴偏移），
    // 而相机一直在转弯 —— 固定一个方向摆，太阳迟早会转到脑后去。
    // 每帧沿「当前视线方向」重新摆一次：太阳右偏 6°、压在灭点上方；
    // 月亮再高一些、偏右多一点，落进天空那条窄带里，也不糊住左上角的标题
    const dir = this.camera.getWorldDirection(new THREE.Vector3())
    dir.y = 0
    dir.normalize()
    // 正的 yaw 会转到左边、压住标题，所以太阳和月亮都用负值，一起落在右上天空
    this.#placeCelestial(this.sunBody, dir, -0.11, 52, 0.02)
    this.#placeCelestial(this.moonBody, dir, -0.2, 118, 0.012)

    this.keyLight.position.set(camera.x + 16, camera.y + 24, camera.z + 10)
    this.keyLight.target.position.set(camera.x, camera.y - 2, camera.z)
    this.keyLight.target.updateMatrixWorld()

    this.fillLight.position.set(camera.x - 20, camera.y + 8, camera.z - 14)
    this.fillLight.target.position.set(camera.x, camera.y - 2, camera.z)
    this.fillLight.target.updateMatrixWorld()
  }

  /**
   * 把一颗太阳 / 月亮摆到当前视线方向上。
   * 光冕与外晕各自缓慢反向旋转：静止的放射线一眼就是贴图，
   * 转起来才有大气在动的感觉。转速压得很低，不允许出现高频闪。
   */
  #placeCelestial(body, dir, yaw, height, spin) {
    if (!body) return
    body.root.position.copy(dir).applyAxisAngle(UP, yaw).multiplyScalar(620)
    body.root.position.y = height
    body.glow.material.rotation = this.elapsed * spin
    body.halo.material.rotation = -this.elapsed * spin * 0.45
  }

  // ---------- 主题 ----------
  /** 主题涉及的每一处颜色：切换时逐项插值，几何与相机完全不动 */
  #themeTargets() {
    const uniforms = this.sky.userData.uniforms
    return [
      { live: this.scene.background, key: 'background' },
      { live: this.scene.fog.color, key: 'fog' },
      { live: this.road.userData.roadMaterial.color, key: 'road' },
      { live: this.road.userData.vergeMaterial.color, key: 'verge' },
      { live: this.ground.userData.material.color, key: 'ground' },
      { live: this.props.userData.treeMaterial.color, key: 'tree' },
      { live: this.props.userData.treeMaterial.emissive, key: 'tree' },
      // 森林密林层有独立材质（要能单独淡出），颜色也得跟着主题一起插值
      { live: this.props.userData.forestMaterial.color, key: 'tree' },
      { live: this.props.userData.forestMaterial.emissive, key: 'tree' },
      { live: this.props.userData.rockMaterial.color, key: 'rock' },
      { live: this.props.userData.boulderMaterial.color, key: 'rock' },
      // 灌木是地被层，颜色跟树走，但有独立材质（透明度各自淡出）
      { live: this.props.userData.bushMaterial.color, key: 'tree' },
      { live: this.props.userData.bushMaterial.emissive, key: 'tree' },
      { live: this.car.userData.paintMaterial.color, key: 'carBody' },
      { live: uniforms.cTop.value, key: 'skyTop' },
      { live: uniforms.cMid.value, key: 'skyMid' },
      { live: uniforms.cHorizon.value, key: 'skyHorizon' },
      { live: uniforms.cBottom.value, key: 'skyBottom' },
    ]
  }

  /**
   * 切主题：山路 / 雪地 / 森林 / 黎明 / 暮色 / 深夜 / 海岸 / 沙漠。
   * 从「当前实际颜色」起步而不是上一套色板，所以连点几次也不会跳。
   *
   * 物件也一起切：树 / 密林 / 仙人掌 / 沙滩海面全都按目标透明度淡入淡出。
   * 整层 visible 硬开关在切换瞬间就是一次「闪」，面积越大越明显。
   */
  setTheme(index) {
    if (this.disposed) return
    const next = ((index % THEMES.length) + THEMES.length) % THEMES.length
    const palette = themePalette(next)
    const profile = themeProfile(next)
    const extras = THEMES[next].extras
    const flora = extras.flora || 'trees'
    const props = this.props.userData

    // 这一套主题里某一层该不该出现
    const active = (when) => {
      if (when === 'trees') return flora === 'trees'
      if (when === 'forest') return !!extras.forestTrees
      if (when === 'cacti') return flora === 'cacti'
      return !!extras[when]
    }

    // 所有会随主题出现/消失的层（树、密林、仙人掌、灌木、岩石、星空、落雪、落日、
    // 沙滩、海、棕榈、礁石、帆船、灯塔）都登记在各自的 fadeLayers 里，
    // 这里统一从当前透明度插到 0 或 1 —— 硬开关 visible 就是一次「闪」
    // max 是该层完全出现时的目标透明度（天象的光冕/外晕不能和本体一样实），
    // 没写 max 的层仍然淡到 1
    const fades = [...props.fadeLayers, ...this.coast.userData.fadeLayers].map((layer) => ({
      layer,
      from: layer.material[layer.key],
      to: active(layer.when) ? (layer.max ?? 1) : 0,
    }))

    this.themeAnim = {
      colors: this.#themeTargets().map(({ live, key }) => ({
        live,
        from: live.clone(),
        to: new THREE.Color(palette[key]),
      })),
      // 自发光强度不是颜色，单独插值
      numbers: [
        {
          live: props.treeMaterial,
          key: 'emissiveIntensity',
          from: props.treeMaterial.emissiveIntensity,
          to: profile.treeGlow,
        },
        {
          live: props.forestMaterial,
          key: 'emissiveIntensity',
          from: props.forestMaterial.emissiveIntensity,
          to: profile.treeGlow,
        },
        {
          live: props.bushMaterial,
          key: 'emissiveIntensity',
          from: props.bushMaterial.emissiveIntensity,
          to: profile.treeGlow * 0.8,
        },
      ],
      fades,
      coast: active('coast'),
      time: 0,
    }

    // 目标层只要会露出来就先挂上（此时透明度还是 0）；收尾时再按最终目标统一关掉
    for (const fade of fades) {
      if (fade.to > 0) fade.layer.object.visible = true
    }
    if (active('coast')) this.coast.visible = true

    // 海岸主题里，30 米宽的水平路肩必须让位给沙坡：
    // 它会把 30 米外的海整个压到地平线以下，画面里只剩沙
    const coastal = active('coast')
    for (const verge of this.road.userData.verges || []) verge.visible = !coastal

    // 天象各自染色：黎明暖橙、暮色偏紫、沙漠晒白、海岸琥珀；
    // 月亮在所有夜间主题里保持同一枚冷白，只靠天空底色衬托。
    // 本体颜色要超过 1：`toneMapped: false` 下 >1 会被钳到纯白，
    // 正好就是「过曝」—— 只给 0~1 的色彩，月亮永远是块灰圆片
    const SUN_TINT = { dawn: 0xffb066, dusk: 0xc79ae0, desert: 0xfff0c4, coast: 0xffd2a1 }
    const sunTint = new THREE.Color(SUN_TINT[THEMES[next].id] || 0xffc48a)
    props.sun.core.material.color.copy(sunTint).multiplyScalar(2.1)
    props.sun.glow.material.color.copy(sunTint).multiplyScalar(1.15)
    props.sun.halo.material.color.copy(sunTint).multiplyScalar(0.9)

    props.moon.core.material.color.setRGB(2.0, 2.08, 2.2)
    props.moon.glow.material.color.setRGB(1.1, 1.16, 1.3)
    props.moon.halo.material.color.setRGB(0.9, 1.02, 1.22)

    this.themeIndex = next
    // 换完主题重新计时：手动点选、自动轮播都走这里
    this.themeClock = 0

    this.onTheme(next)
  }

  #updateTheme(dt) {
    const anim = this.themeAnim
    if (!anim) return

    anim.time += dt
    const k = easeInOutCubic(Math.min(1, anim.time / 0.9))
    for (const item of anim.colors) {
      item.live.copy(item.from).lerp(item.to, k)
    }
    for (const item of anim.numbers) {
      item.live[item.key] = item.from + (item.to - item.from) * k
    }
    for (const fade of anim.fades) {
      fade.layer.material[fade.layer.key] = fade.from + (fade.to - fade.from) * k
    }

    if (anim.time >= 0.9) {
      // 透明度已经到 0 的层收掉，下一套主题之前不再参与渲染
      for (const fade of anim.fades) {
        if (fade.to <= 0) fade.layer.object.visible = false
      }
      this.coast.visible = anim.coast
      this.themeAnim = null
    }
  }

  #loop = (now) => {
    if (this.disposed) return
    // 出画时不停 rAF，只在这里空转：停掉 rAF 后一旦画布被 resize 清空，
    // 就再也没有下一帧来补，回来时会是黑的（而且 resume 的竞态很难补干净）
    this.raf = requestAnimationFrame(this.#loop)
    if (this.paused) {
      this.lastTime = 0
      return
    }

    if (!this.lastTime) this.lastTime = now
    const dt = Math.min(0.05, (now - this.lastTime) / 1000)
    this.lastTime = now
    this.elapsed += dt

    if (this.mode === 'follow') {
      // 系统设置「减少动态效果」或用户按空格时车停在原地，但画框点击与相机推进仍然可用
      if (!this.reduced && !this.hold) {
        this.carU = wrap01(this.carU + (this.speed * dt) / this.length)
      }
      this.#updateOrbit(dt)
      this.#applyFollow()
    } else if (this.mode === 'flying') {
      this.#updateFly(dt)
    } else if (this.mode === 'returning') {
      this.#updateReturn(dt)
    }

    this.#updateCar(dt)
    this.#updateBoards()
    this.#updateLights()
    // 海面只在海岸主题里存在，关掉时连 uniform 都不用推
    if (this.coast.visible) this.coast.userData.waterMaterial.uniforms.uTime.value = this.elapsed
    // 落雪只在雪原主题里动：点云是以天空球为坐标的，本地循环即可
    if (this.snow?.points.visible) this.snow.update(this.elapsed)
    this.#updateTheme(dt)

    // 没人碰画面时，每隔 MOTION.themeInterval 秒换下一套场景。
    // 用户一拖一按（见 #handlePointerDown / #handleKeyDown）就重新计时
    if (this.mode === 'follow' && this.inView && !this.reduced && !this.hold) {
      this.themeClock += dt
      if (this.themeClock >= MOTION.themeInterval) this.setTheme(this.themeIndex + 1)
    }
    // 直出到默认帧缓冲：走离屏后处理链会让合成器整帧丢内容（见构造函数注释）
    this.renderer.setRenderTarget(null)
    this.renderer.render(this.scene, this.camera)
  }

  // ---------- 点击推进 ----------
  #updateFly(dt) {
    const fly = this.fly
    fly.time += dt
    const k = easeInOutCubic(Math.min(1, fly.time / CAMERA.flyDuration))

    this.camera.position.lerpVectors(fly.from, fly.to, k)
    this.camera.quaternion.slerpQuaternions(fly.fromQuaternion, fly.toQuaternion, k)

    if (fly.time >= CAMERA.flyDuration) {
      this.mode = 'focused'
      this.#renderOnce()
      this.onSelect({
        item: fly.item,
        rect: this.#projectedRect(fly.board.plane),
      })
    }
  }

  #updateReturn(dt) {
    const state = this.returning
    state.time += dt
    const k = easeInOutCubic(Math.min(1, state.time / CAMERA.returnDuration))

    const pose = this.#followPose()
    this.camera.position.lerpVectors(state.from, pose.position, k)
    this.camera.quaternion.slerpQuaternions(state.fromQuaternion, pose.quaternion, k)

    if (state.time >= CAMERA.returnDuration) {
      this.mode = 'follow'
      this.returning = null
    }
  }

  focus(board) {
    if (this.mode !== 'follow') return

    const center = new THREE.Vector3()
    board.plane.getWorldPosition(center)

    const direction = center.clone().sub(this.camera.position).normalize()
    const to = center.clone().addScaledVector(direction, -CAMERA.focusDistance)

    const matrix = new THREE.Matrix4().lookAt(to, center, UP)
    this.fly = {
      board,
      item: board.item,
      time: 0,
      from: this.camera.position.clone(),
      to,
      fromQuaternion: this.camera.quaternion.clone(),
      toQuaternion: new THREE.Quaternion().setFromRotationMatrix(matrix),
    }
    this.mode = 'flying'
  }

  /** 放映层关闭后把相机送回车上 */
  resetView() {
    if (this.mode === 'follow') return
    this.fly = null

    // 回程每帧重新取「车后」的位姿：车在这 0.8 秒里还在往前开
    this.returning = {
      time: 0,
      from: this.camera.position.clone(),
      fromQuaternion: this.camera.quaternion.clone(),
    }
    this.mode = 'returning'
  }

  #projectedRect(plane) {
    const width = this.host.clientWidth
    const height = this.host.clientHeight
    // 画布在视口里并不从 (0,0) 开始（顶部有导航栏），转场要用视口坐标
    const hostRect = this.host.getBoundingClientRect()
    const halfW = plane.geometry.parameters.width / 2
    const halfH = plane.geometry.parameters.height / 2
    const point = new THREE.Vector3()

    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity

    for (const [x, y] of [
      [-halfW, -halfH],
      [halfW, -halfH],
      [halfW, halfH],
      [-halfW, halfH],
    ]) {
      point.set(x, y, 0).applyMatrix4(plane.matrixWorld).project(this.camera)
      const px = (point.x * 0.5 + 0.5) * width
      const py = (-point.y * 0.5 + 0.5) * height
      minX = Math.min(minX, px)
      minY = Math.min(minY, py)
      maxX = Math.max(maxX, px)
      maxY = Math.max(maxY, py)
    }

    return { x: hostRect.left + minX, y: hostRect.top + minY, w: maxX - minX, h: maxY - minY }
  }

  // ---------- 事件 ----------
  #bindEvents() {
    this.canvas = this.renderer.domElement
    this.onPointerMove = this.#handlePointerMove
    this.onPointerDown = this.#handlePointerDown
    this.onPointerUp = this.#handlePointerUp
    this.onPointerLeave = this.#handlePointerLeave
    this.onClick = this.#handleClick
    this.onKeyDown = this.#handleKeyDown
    this.onVisibility = () => {
      this.lastTime = 0
    }
    this.onResize = () => this.resize()

    this.canvas.addEventListener('pointermove', this.onPointerMove)
    this.canvas.addEventListener('pointerdown', this.onPointerDown)
    // 画布上也要挂 up/cancel：拖出画布或合成事件不冒泡时，仍能结束拖拽
    this.canvas.addEventListener('pointerup', this.onPointerUp)
    this.canvas.addEventListener('pointercancel', this.onPointerUp)
    window.addEventListener('pointerup', this.onPointerUp)
    window.addEventListener('pointercancel', this.onPointerUp)
    this.canvas.addEventListener('pointerleave', this.onPointerLeave)
    this.canvas.addEventListener('click', this.onClick)
    window.addEventListener('keydown', this.onKeyDown)
    document.addEventListener('visibilitychange', this.onVisibility)

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.resize())
      this.resizeObserver.observe(this.host)
    } else {
      window.addEventListener('resize', this.onResize)
    }

    // 滚到档案区后 hero 已经出画，没必要继续占用 GPU
    if (typeof IntersectionObserver !== 'undefined') {
      this.intersection = new IntersectionObserver(
        (entries) => {
          const entry = entries[0]
          if (!entry) return
          this.inView = entry.isIntersecting
          if (entry.isIntersecting) this.#resume()
          else this.#pause()
        },
        { threshold: 0 },
      )
      this.intersection.observe(this.host)
    }
  }

  #handlePointerMove = (event) => {
    if (!this.canvas) return

    // 拖拽中：围绕车身转视角，松手回正
    if (this.drag) {
      const dx = event.clientX - this.drag.x
      const dy = event.clientY - this.drag.y
      this.drag.moved = Math.max(this.drag.moved, Math.hypot(dx, dy))
      this.orbit.targetYaw = THREE.MathUtils.clamp(
        this.drag.yaw - dx * 0.0042,
        -MOTION.orbitYaw,
        MOTION.orbitYaw,
      )
      this.orbit.targetPitch = THREE.MathUtils.clamp(
        this.drag.pitch + dy * 0.0032,
        -MOTION.orbitPitch,
        MOTION.orbitPitch,
      )
      return
    }

    if (this.mode !== 'follow') return
    this.#setHover(this.#pick(event.clientX, event.clientY))
  }

  #handlePointerDown = (event) => {
    if (this.mode !== 'follow' || event.button !== 0) return
    // 用户开始操作：重新计时，别在拖拽的半途把场景换掉
    this.themeClock = 0
    this.drag = {
      x: event.clientX,
      y: event.clientY,
      yaw: this.orbit.targetYaw,
      pitch: this.orbit.targetPitch,
      moved: 0,
    }
    // 抓住指针：拖到画布外松手也能收到 pointerup，视角不会卡在侧面
    try {
      this.canvas?.setPointerCapture?.(event.pointerId)
    } catch {
      // 合成事件没有真实 pointerId，忽略
    }
    // 拖拽时不要保留画框的悬停态，否则光标会在 pointer / grabbing 之间跳
    this.#setHover(null)
    if (this.canvas) this.canvas.style.cursor = 'grabbing'
  }

  #handlePointerUp = () => {
    if (!this.drag) return
    const dragged = this.drag.moved > 6
    this.drag = null
    this.orbit.targetYaw = 0
    this.orbit.targetPitch = 0
    if (this.canvas) this.canvas.style.cursor = this.hover ? 'pointer' : 'default'

    if (dragged) {
      // 拖完松手浏览器还会补一个 click，别让它误开画框
      this.suppressClick = true
      setTimeout(() => {
        this.suppressClick = false
      }, 0)
    }
  }

  #handlePointerLeave = () => {
    if (this.drag) return
    this.#setHover(null)
    if (this.canvas) this.canvas.style.cursor = 'default'
  }

  #handleClick = (event) => {
    if (this.suppressClick) {
      this.suppressClick = false
      return
    }
    if (this.mode !== 'follow') return
    // 不依赖 hover：点击时按落点重新拾取一次，触屏与「先点后移」都不会漏
    const board = this.#pick(event.clientX, event.clientY) || this.hover
    if (!board) return
    this.focus(board)
  }

  #handleKeyDown = (event) => {
    if (!this.inView || this.mode !== 'follow') return
    if (event.code !== 'Space') return
    const target = event.target
    if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable) return
    event.preventDefault()
    this.hold = !this.hold
    this.themeClock = 0
  }

  /** 悬停：缩放 + 边框自发光，泛光会把它点亮 */
  #setHover(board) {
    if (board === this.hover) return

    if (this.hover) {
      this.hover.face.scale.setScalar(1)
      this.hover.borderMaterial.emissiveIntensity = 0
    }

    this.hover = board || null

    if (this.hover) {
      this.hover.face.scale.setScalar(MOTION.hoverScale)
      this.hover.borderMaterial.emissiveIntensity = 0.85
    }

    if (this.canvas) this.canvas.style.cursor = board ? 'pointer' : 'default'
  }

  /** 屏幕坐标 → 命中的画框（没有就返回 null） */
  #pick(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect()
    if (!rect.width || !rect.height || !this.planeMeshes?.length) return null

    const toNdc = (x, y) =>
      this.pointer.set(
        ((x - rect.left) / rect.width) * 2 - 1,
        -((y - rect.top) / rect.height) * 2 + 1,
      )

    // 画框一直在往前跑，点击落在框沿外侧一两像素很常见：
    // 精确点没中就按小半径探一圈，手感上等于「点到框就开」。
    const offsets = [
      [0, 0],
      [10, 0], [-10, 0], [0, 10], [0, -10],
      [18, 18], [-18, 18], [18, -18], [-18, -18],
    ]

    for (const [dx, dy] of offsets) {
      toNdc(clientX + dx, clientY + dy)
      this.raycaster.setFromCamera(this.pointer, this.camera)
      const hit = this.raycaster.intersectObjects(this.planeMeshes, false)[0]
      if (!hit) continue
      const board = this.boards.find((item) => item.plane === hit.object)
      if (board && board.face.visible) return board
    }

    return null
  }

  // ---------- 生命周期 ----------
  // 出画只标记暂停，rAF 继续空转（见 #loop）：这样 resize 清空画布后，
  // 回到视口时仍有下一帧把画面补回来
  #pause() {
    this.paused = true
  }

  #resume() {
    if (this.disposed) return
    this.paused = false
    this.lastTime = 0
    if (!this.raf) this.raf = requestAnimationFrame(this.#loop)
  }

  resize() {
    const width = this.host.clientWidth
    const height = this.host.clientHeight
    if (!width || !height || !this.renderer) return

    // 尺寸没变就别碰 setSize：它会重建画布资源并清空绘制缓冲，
    // ResizeObserver 多回调一次就是一次黑屏
    if (this.size && this.size.w === width && this.size.h === height) return
    this.size = { w: width, h: height }

    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height, false)

    // setSize 会重置画布内容：如果此刻正处于暂停 / 空格停车状态，
    // rAF 不会再来补帧，画布就会停在「清空后的黑屏」上。
    // 这里立刻补一帧，滚一下页面也不会黑。
    if (this.paused || this.hold) this.#renderOnce()
  }

  setItems(items) {
    this.items = items || []
    this.#setHover(null)
    this.hover = null
    if (this.canvas) this.canvas.style.cursor = 'default'
    this.#buildBoards()
    this.#renderOnce()
  }

  #renderOnce() {
    if (!this.renderer) return
    this.#updateCar()
    this.#updateBoards()
    this.#updateLights()
    this.renderer.setRenderTarget(null)
    this.renderer.render(this.scene, this.camera)
  }

  dispose() {
    this.disposed = true
    cancelAnimationFrame(this.raf)

    if (this.canvas) {
      this.canvas.removeEventListener('pointermove', this.onPointerMove)
      this.canvas.removeEventListener('pointerdown', this.onPointerDown)
      this.canvas.removeEventListener('pointerup', this.onPointerUp)
      this.canvas.removeEventListener('pointercancel', this.onPointerUp)
      this.canvas.removeEventListener('pointerleave', this.onPointerLeave)
      this.canvas.removeEventListener('click', this.onClick)
    }
    window.removeEventListener('pointerup', this.onPointerUp)
    window.removeEventListener('pointercancel', this.onPointerUp)
    window.removeEventListener('keydown', this.onKeyDown)
    document.removeEventListener('visibilitychange', this.onVisibility)
    window.removeEventListener('resize', this.onResize)
    this.resizeObserver?.disconnect()
    this.intersection?.disconnect()

    this.scene.traverse((object) => {
      if (object.geometry) object.geometry.dispose()
      if (object.material) {
        const materials = Array.isArray(object.material) ? object.material : [object.material]
        for (const material of materials) {
          for (const key of ['map', 'emissiveMap']) {
            if (material[key]) material[key].dispose()
          }
          material.dispose()
        }
      }
    })

    this.envTarget?.dispose()
    this.renderer?.dispose()
    if (this.canvas?.parentNode) this.canvas.parentNode.removeChild(this.canvas)
    this.canvas = null
  }
}
