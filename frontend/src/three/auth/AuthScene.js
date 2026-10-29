import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'

import {
  CAMERA,
  FLIGHT,
  GROUND_Y,
  INTRO,
  MOODS,
  STORY,
  easeInCubic,
  easeInOutCubic,
  easeOutCubic,
} from './config'
import { buildSky, buildStars, buildMoon } from './sky'
import { buildAurora } from './aurora'
import { buildLandscape, groundHeightAt } from './landscape'
import { buildSnowProps } from './props'
import { buildDetails } from './details'
import { buildGirl } from './girl'
import { buildSnowfall } from './snow'
import { buildHelicopter } from './helicopter'

const clamp01 = (value) => Math.min(1, Math.max(0, value))
const lerp = (a, b, t) => a + (b - a) * t

function bezier(p0, p1, p2, p3, t) {
  const s = 1 - t
  return new THREE.Vector3(
    s * s * s * p0.x + 3 * s * s * t * p1.x + 3 * s * t * t * p2.x + t * t * t * p3.x,
    s * s * s * p0.y + 3 * s * s * t * p1.y + 3 * s * t * t * p2.y + t * t * t * p3.y,
    s * s * s * p0.z + 3 * s * s * t * p1.z + 3 * s * t * t * p2.z + t * t * t * p3.z,
  )
}

/**
 * 登录 / 注册页的 3D 片场。
 *
 * 分镜：
 * 1. 开场镜头从雪谷上空一路推进到表单高度（4.4s，缓出）；
 * 2. 直升机从一侧的取景框外飞入，绕到表单旁边悬停，探照灯扫在雪地上；
 * 3. 切换登录 / 注册时，直升机拔高飞出画面，镜头向另一侧摆过去，
 *    再从相反的方向绕回来 —— 两种模式的进入方向天然不同。
 *
 * 渲染直出默认帧缓冲，不使用 EffectComposer：离屏后处理链会让合成器
 * 间歇性整帧拿不到内容（首页踩过的坑），抗锯齿交给 renderer 自己。
 */
export class AuthScene {
  constructor(host, { mode = 'login', onReady } = {}) {
    this.host = host
    this.mode = mode
    this.side = mode === 'login' ? -1 : 1
    // 直升机固定停在卡片右边：女孩永远在左边，两个主体一边一个
    this.flightSide = 1
    // 女孩的屏幕锚点，由 #layout 每帧写
    this.girlAnchor = new THREE.Vector3(-17.2, 0, 14)
    this.onReady = onReady || (() => {})

    this.elapsed = 0
    this.introT = 0
    this.swing = this.side
    this.disposed = false
    this.paused = false
    this.inView = true

    this.phase = 'enter'
    this.phaseClock = -FLIGHT.enterDelay
    // 进场结束后的盘旋计时：用来把「对着表单悬停」平滑接到椭圆航线上
    this.patrolClock = 0
    this.outPoint = null
    this.cardRect = null
    this.reduced =
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.NeutralToneMapping
    this.renderer.toneMappingExposure = 1.1
    this.renderer.domElement.style.display = 'block'
    this.renderer.domElement.style.width = '100%'
    this.renderer.domElement.style.height = '100%'
    host.appendChild(this.renderer.domElement)

    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x04070d)
    this.scene.fog = new THREE.FogExp2(0x081522, 0.0034)

    this.camera = new THREE.PerspectiveCamera(CAMERA.fov, 1, CAMERA.near, CAMERA.far)
    this.camera.position.set(INTRO.from.x, INTRO.from.y, INTRO.from.z)

    this.#buildEnvironment()
    this.#buildLights()
    this.#buildWorld()

    this.#applyMood(MOODS[mode], 1)
    this.#layout()
    this.#placeHelicopterInitial()

    this.#bind()
    this.resize()
    this.#renderOnce()
    this.onReady()

    this.lastTime = 0
    this.raf = requestAnimationFrame(this.#loop)
  }

  // ---------- 组装 ----------
  #buildEnvironment() {
    const pmrem = new THREE.PMREMGenerator(this.renderer)
    this.envTarget = pmrem.fromScene(new RoomEnvironment(), 0.04)
    this.scene.environment = this.envTarget.texture
    this.scene.environmentIntensity = 0.34
    pmrem.dispose()
  }

  #buildLights() {
    // 雪面反光很强：半球光给的是「天光 + 雪地反弹」的底，
    // 主光只负责在雪脊上留下一点点明暗差，压太高雪会糊成一张白纸
    this.hemi = new THREE.HemisphereLight(0x9fd8ff, 0x0a1424, 1.45)
    this.scene.add(this.hemi)

    this.key = new THREE.DirectionalLight(0xd3e6ff, 2.25)
    this.key.position.set(-46, 86, 52)
    this.scene.add(this.key)

    this.fill = new THREE.DirectionalLight(0x6f8fff, 0.7)
    this.fill.position.set(72, 34, -70)
    this.scene.add(this.fill)
  }

  #buildWorld() {
    this.skyRig = new THREE.Group()
    this.scene.add(this.skyRig)

    this.sky = buildSky()
    this.skyRig.add(this.sky.mesh)

    this.stars = buildStars()
    this.skyRig.add(this.stars.points)

    this.moon = buildMoon()
    this.skyRig.add(this.moon.root)

    this.aurora = buildAurora()
    this.skyRig.add(this.aurora.root)
    this.auroraBase = this.aurora.layers.map((mesh) => mesh.material.uniforms.uIntensity.value)

    this.landscape = buildLandscape()
    this.scene.add(this.landscape.group)

    this.props = buildSnowProps()
    this.scene.add(this.props.group)

    this.details = buildDetails()
    this.scene.add(this.details.group)

    // 小女孩：从木屋里走出来、走到表单左下角的那条小剧情
    this.girl = buildGirl(this.details.home, { reduced: this.reduced })
    this.scene.add(this.girl.group)
    this.scene.add(this.girl.burst)

    this.snow = buildSnowfall()
    this.skyRig.add(this.snow.points)

    this.heli = buildHelicopter()
    this.heli.group.scale.setScalar(FLIGHT.scale)
    this.scene.add(this.heli.group)
    this.scene.add(this.heli.pool)
    this.scene.add(this.heli.wash)
    // 卡片在屏幕上的矩形 / 视口尺寸：DOM 量好后传进来，用来决定直升机停在哪儿
    this.cardRatio = 0.27
  }

  #placeHelicopterInitial() {
    const { group } = this.heli
    group.position.set(this.flightSide * FLIGHT.start.x, FLIGHT.start.y, FLIGHT.start.z)
  }

  // ---------- 模式 ----------
  /**
   * 切换模式：先把画面里那架飞走，再从同一侧绕回来。
   * 直升机固定停在卡片右边（`flightSide`），只有镜头会随模式往左 / 往右摆；
   * 女孩始终在卡片左边，两个主体不会因为切页挤到同一侧。
   */
  setMode(next) {
    if (this.disposed || next === this.mode) return
    this.mode = next
    this.side = next === 'login' ? -1 : 1

    this.outFrom = this.heli.group.position.clone()
    this.outPoint = {
      end: new THREE.Vector3(this.flightSide * 120, 46, 58),
      c1: new THREE.Vector3(this.flightSide * 34, 8, 16),
      c2: new THREE.Vector3(this.flightSide * 82, 26, 42),
    }
    this.phase = 'out'
    this.phaseClock = 0

    this.#applyMood(MOODS[next], 0)
    this.#layout()
  }

  /** 极光 / 雾 / 灯光的配色插值：登录青绿、注册紫红 */
  #applyMood(mood, instant) {
    const targets = {
      fog: new THREE.Color(mood.fog),
      hemi: new THREE.Color(mood.hemi),
      key: new THREE.Color(mood.key),
      skyTop: new THREE.Color(mood.skyTop),
      skyMid: new THREE.Color(mood.skyMid),
      skyHorizon: new THREE.Color(mood.skyHorizon),
      auroraA: new THREE.Color(mood.auroraA),
      auroraB: new THREE.Color(mood.auroraB),
      auroraC: new THREE.Color(mood.auroraC),
      snowTint: new THREE.Color(mood.snowTint),
      intensity: mood.auroraIntensity,
    }

    this.moodFrom = {
      fog: this.scene.fog.color.clone(),
      hemi: this.hemi.color.clone(),
      key: this.key.color.clone(),
      skyTop: this.sky.uniforms.cTop.value.clone(),
      skyMid: this.sky.uniforms.cMid.value.clone(),
      skyHorizon: this.sky.uniforms.cHorizon.value.clone(),
      auroraA: this.aurora.uniforms[0].uColorA.value.clone(),
      auroraB: this.aurora.uniforms[0].uColorB.value.clone(),
      auroraC: this.aurora.uniforms[0].uColorC.value.clone(),
      snowTint: this.landscape.snow.material.color.clone(),
      intensity: this.auroraBase[0],
    }
    this.moodTo = targets
    this.moodClock = instant
    if (instant >= 1) this.#mixMood(1)
  }

  #mixMood(k) {
    const from = this.moodFrom
    const to = this.moodTo
    this.scene.fog.color.copy(from.fog).lerp(to.fog, k)
    this.hemi.color.copy(from.hemi).lerp(to.hemi, k)
    this.key.color.copy(from.key).lerp(to.key, k)
    this.sky.uniforms.cTop.value.copy(from.skyTop).lerp(to.skyTop, k)
    this.sky.uniforms.cMid.value.copy(from.skyMid).lerp(to.skyMid, k)
    this.sky.uniforms.cHorizon.value.copy(from.skyHorizon).lerp(to.skyHorizon, k)
    this.landscape.snow.material.color.copy(from.snowTint).lerp(to.snowTint, k)

    for (let i = 0; i < this.aurora.uniforms.length; i += 1) {
      const uniforms = this.aurora.uniforms[i]
      uniforms.uColorA.value.copy(from.auroraA).lerp(to.auroraA, k)
      uniforms.uColorB.value.copy(from.auroraB).lerp(to.auroraB, k)
      uniforms.uColorC.value.copy(from.auroraC).lerp(to.auroraC, k)
      uniforms.uIntensity.value =
        this.auroraBase[i] * lerp(from.intensity, to.intensity, k)
    }
  }

  // ---------- 布局 ----------
  /** 由 Vue 传入卡片在屏幕上的矩形：直升机据此停在卡片外侧上角 */
  setCardRect(rect) {
    if (!rect || !Number.isFinite(rect.left) || !Number.isFinite(rect.top)) return
    this.cardRect = rect
    this.#layout()
  }

  /** 用户正在拖卡片：直升机跟着一起挪，读起来是它真的停在表单上 */
  setCardDrag(dx) {
    this.cardDrag = Number.isFinite(dx) ? dx : 0
    this.#layout()
  }

  #layout() {
    const aspect = this.width && this.height ? this.width / this.height : 1.6

    // 竖屏时卡片几乎铺满整屏，直升机没有容身之处 —— 只留极光与雪谷
    const show = aspect >= 1.25
    this.heli.group.visible = show
    this.heli.pool.visible = show
    this.heli.wash.visible = show
    if (!show) return

    const vw = this.cardRect?.vw || this.width || 1440
    const vh = this.cardRect?.vh || this.height || 900
    // 卡片量不到时按旧比例兜底（首帧会立刻被 setCardRect 纠正）
    const dragX = this.cardDrag || 0
    const cardLeft = (this.cardRect ? this.cardRect.left : vw * (0.5 - this.cardRatio)) + dragX
    const cardRight = (this.cardRect ? this.cardRect.right : vw * (0.5 + this.cardRatio)) + dragX
    const cardTop = this.cardRect ? this.cardRect.top : vh * 0.26

    // 停靠点 = 卡片右侧外沿再往外让一点，纵向落在卡片上沿往下一点。
    // 直升机固定停在卡片右边、女孩固定在左边 —— 两边各一个主体，互不压着。
    // 上限留给尾梁：机头指向表单时，六米长的尾梁是朝画面外伸的，
    // 1180 宽的窗口里按卡片边算会把它切掉
    const anchor = FLIGHT.anchor
    const targetX = THREE.MathUtils.clamp(
      (cardRight + this.flightSide * vw * anchor.outward) / vw,
      0.13,
      0.87,
    )
    const targetY = THREE.MathUtils.clamp((cardTop + vh * anchor.down) / vh, 0.08, 0.9)

    // 按「镜头落位后」的机位造一台探针相机，把屏幕点反投影到悬停平面。
    // 之前拿水平半宽推 x，宽屏上会差出将近一倍；用投影矩阵反算才和画面对得上
    const probe = new THREE.PerspectiveCamera(CAMERA.fov, aspect, CAMERA.near, CAMERA.far)
    probe.position.set(INTRO.to.x + this.side * 1.8, INTRO.to.y, INTRO.to.z)
    probe.up.set(0, 1, 0)
    probe.lookAt(
      new THREE.Vector3(INTRO.to.x + this.side * 3.1, INTRO.to.lookY, INTRO.to.lookZ),
    )
    probe.rotateZ(this.side * 0.02)
    probe.updateMatrixWorld()

    const point = new THREE.Vector3(targetX * 2 - 1, 1 - targetY * 2, 0.5).unproject(probe)
    const ray = new THREE.Ray(probe.position, point.sub(probe.position).normalize())
    const hit = new THREE.Vector3()
    ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), -FLIGHT.hoverZ), hit)

    this.hover = new THREE.Vector3(hit.x, hit.y, FLIGHT.hoverZ)

    // 女孩的落点也按屏幕算：卡片左边缘再往外让一点，纵向落在画面下方。
    // 直接把世界坐标写死的话，登录/注册的镜头摆向和 1180 窄屏会把她推出画面
    const girlScreenX = THREE.MathUtils.clamp(cardLeft - vw * 0.052, 24, vw * 0.35) / vw
    // 0.86 而不是 0.9：人物放大到 190px 后，脚底要往上收一点，
    // 头顶才不会顶到卡片下沿，跳舞时举高的手也还在画面里
    const girlScreenY = 0.86
    const girlPoint = new THREE.Vector3(girlScreenX * 2 - 1, 1 - girlScreenY * 2, 0.5).unproject(
      probe,
    )
    const girlRay = new THREE.Ray(probe.position, girlPoint.sub(probe.position).normalize())
    const girlHit = new THREE.Vector3()
    // 用她自己的深度平面求交：只让 x 跟着卡片走，远近不变
    girlRay.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), -14), girlHit)
    if (Number.isFinite(girlHit.x)) this.girlAnchor.set(girlHit.x, 0, 14)
  }

  // ---------- 每帧 ----------
  #loop = (now) => {
    if (this.disposed) return
    this.raf = requestAnimationFrame(this.#loop)

    if (this.paused || !this.inView) {
      this.lastTime = now
      return
    }

    // 不钳制 dt：开场的推进和「飞出→飞入」必须与 DOM 那 640/940ms 对齐，
    // 一旦按 0.05 秒封顶，低帧率机器上直升机会比卡片慢一截
    const dt = this.lastTime ? Math.min(0.5, (now - this.lastTime) / 1000) : 0.016
    this.lastTime = now
    this.elapsed += dt

    this.#updateFlight(dt)
    this.#updateCamera(dt)
    this.#updateMood(dt)
    this.#updateSnow(dt)
    this.#updateHeli(dt)

    this.renderer.render(this.scene, this.camera)
  }

  #updateCamera(dt) {
    this.introT = Math.min(1, this.introT + dt / INTRO.duration)
    const k = easeOutCubic(this.introT)
    const from = INTRO.from
    const to = INTRO.to

    const sway = this.reduced ? 0 : 1
    const position = new THREE.Vector3(
      lerp(from.x, to.x, k) + Math.sin(this.elapsed * 0.23) * 0.6 * sway + this.swing * 1.8,
      lerp(from.y, to.y, k) + Math.sin(this.elapsed * 0.31) * 0.32 * sway,
      lerp(from.z, to.z, k),
    )
    const look = new THREE.Vector3(
      Math.sin(this.elapsed * 0.17) * 0.5 * sway + this.swing * 3.1,
      lerp(from.lookY, to.lookY, k) + Math.sin(this.elapsed * 0.21) * 0.14 * sway,
      lerp(from.lookZ, to.lookZ, k),
    )

    this.camera.position.copy(position)
    this.camera.up.set(0, 1, 0)
    this.camera.lookAt(look)
    this.camera.rotateZ(this.swing * 0.02)

    // 天空穹顶 / 极光 / 月亮 / 雪都挂在 rig 上，跟着相机平移，
    // 于是永远停在「无限远」，也不会在推进时被甩到镜头后面
    this.skyRig.position.copy(this.camera.position)
  }

  #updateFlight(dt) {
    this.swing += (this.side - this.swing) * (1 - Math.exp(-2.6 * dt))

    if (this.phase === 'patrol') return

    this.phaseClock += dt
    if (this.phaseClock < 0) return

    if (this.phase === 'enter' || this.phase === 'in') {
      const duration = this.phase === 'enter' ? FLIGHT.enter : FLIGHT.switchIn
      const t = clamp01(this.phaseClock / duration)
      const p = easeOutCubic(t)
      const start = new THREE.Vector3(
        this.flightSide * FLIGHT.start.x,
        FLIGHT.start.y,
        FLIGHT.start.z,
      )
      const c1 = new THREE.Vector3(this.flightSide * 62, 30, 10)
      const c2 = new THREE.Vector3(this.flightSide * 34, 19, -12)
      this.flightPosition = bezier(start, c1, c2, this.hover, p)
      this.flightBank = -this.flightSide * (1 - p) * 0.5
      if (t >= 1) {
        this.phase = 'patrol'
        this.phaseClock = 0
        this.patrolClock = 0
      }
      return
    }

    if (this.phase === 'out') {
      const t = clamp01(this.phaseClock / FLIGHT.leave)
      const p = easeInCubic(t)
      this.flightPosition = bezier(this.outFrom, this.outPoint.c1, this.outPoint.c2, this.outPoint.end, p)
      this.flightBank = this.flightSide * 0.55 * p
      if (t >= 1) {
        this.phase = 'in'
        this.phaseClock = 0
      }
    }
  }

  #updateHeli(dt) {
    const heli = this.heli
    if (!heli.group.visible) return

    const group = heli.group

    if (this.phase === 'patrol') {
      // 停不下来：绕停靠点画一个持续 19 秒的椭圆，边飞边慢慢升降。
      // 盘旋时桨叶 + 光斑本来就有，但机体钉死在一处读起来是「模型摆件」，
      // 所以这里让它一直动，并且每圈从机头到机尾都露出角度
      this.patrolClock += dt
      const speed = this.reduced ? 0.13 : 0.33
      const a = this.elapsed * speed
      const radiusX = 9
      const radiusZ = 5.6
      const centerX = this.hover.x + 9.5
      const centerZ = this.hover.z + 1
      const px = centerX + Math.cos(a) * radiusX
      const py = this.hover.y + Math.sin(a * 2) * 1.4
      const pz = centerZ + Math.sin(a) * radiusZ
      const aheadX = centerX + Math.cos(a + 0.16) * radiusX
      const aheadZ = centerZ + Math.sin(a + 0.16) * radiusZ

      // 接进来的时候不能瞬移：前半秒从停靠点平滑切到椭圆航线
      const k = easeOutCubic(clamp01(this.patrolClock / 2.6))
      group.position.set(
        lerp(this.hover.x, px, k),
        lerp(this.hover.y, py, k),
        lerp(this.hover.z, pz, k),
      )

      // 机头方向也从「对着表单」慢慢转到航线的切线方向
      group.lookAt(
        lerp(0, aheadX, k),
        group.position.y + 0.25,
        lerp(4.4, aheadZ, k),
      )
      // 机体向圆心里倾一点：转弯时没有这个侧倾就是平移的模型
      group.rotateZ(0.11 * k)
    } else if (this.flightPosition) {
      group.position.copy(this.flightPosition)
      const ahead = this.flightPosition
        .clone()
        .add(new THREE.Vector3(this.flightSide * -1.4, this.phase === 'out' ? 1.4 : -0.6, 4.5))
      group.lookAt(ahead)
      group.rotateZ(this.flightBank || 0)
    }

    // 旋翼：桨叶转 + 半透明桨盘一起读成「在转」，单靠桨叶在 60fps 下会出频闪
    const spinDt = Math.min(dt, 0.1)
    const spin = this.reduced ? 0.35 : 1
    heli.rotor.rotation.y += spinDt * 26 * spin
    heli.tailRotor.rotation.x += spinDt * 44 * spin

    // 防撞灯：1.6s 一次的短促白闪，频率压到 1Hz 以下，不会变成「闪烁」
    const cycle = this.elapsed % 1.6
    heli.strobe.material.opacity = cycle < 0.14 ? 1 - Math.abs(cycle - 0.07) / 0.07 : 0

    // 探照灯在雪地上的光斑：从机头沿光锥方向落到地面
    const direction = heli.beamLocal.clone().applyQuaternion(group.quaternion)
    if (direction.y < -0.05) {
      const nose = group.localToWorld(new THREE.Vector3(0, 0.36, 3.16))
      const distance = (nose.y - GROUND_Y) / -direction.y
      heli.pool.position.copy(nose).addScaledVector(direction, distance)
      // 光斑要贴着雪面：固定 y 会被雪脊埋掉，整块光就消失了
      heli.pool.position.y =
        groundHeightAt(heli.pool.position.x, heli.pool.position.z) + 0.09
      // 光斑跟着距离变淡：飞远了就别在雪地上留一块亮斑
      const near = 1 - clamp01((distance - 6) / 34)
      heli.pool.material.opacity = 0.14 + near * 0.5
      heli.pool.scale.setScalar(4 + near * 3)
      heli.beam.material.uniforms.uOpacity.value = 0.16 + near * 0.2
    }

    // 旋翼下洗：机腹正下方的雪面被吹起一圈雪尘，悬停时才明显
    const ground = groundHeightAt(group.position.x, group.position.z)
    const altitude = group.position.y - ground
    const strength = clamp01(1 - (altitude - 9) / 28)
    heli.wash.position.set(group.position.x, ground + 0.12, group.position.z)
    heli.wash.scale.setScalar(9 + strength * 6 + Math.sin(this.elapsed * 1.4) * 0.7)
    heli.wash.material.opacity = 0.05 + strength * 0.16
  }

  #updateMood(dt) {
    if (this.moodClock >= 1) return
    this.moodClock = Math.min(1, this.moodClock + dt / 1.2)
    this.#mixMood(easeInOutCubic(this.moodClock))
  }

  #updateSnow(dt) {
    this.snow.update(this.elapsed)
    this.aurora.update(this.elapsed)
    this.details.update(this.elapsed)
    // 女孩的剧情时间从「镜头落定之后」起算，开场不抢直升机的戏
    this.girl.update(dt, this.elapsed - STORY.start, this.girlAnchor)
  }

  // ---------- 生命周期 ----------
  #bind() {
    this.onVisibility = () => {
      this.paused = document.hidden
    }
    document.addEventListener('visibilitychange', this.onVisibility)

    if (typeof ResizeObserver !== 'undefined') {
      this.observer = new ResizeObserver(() => this.resize())
      this.observer.observe(this.host)
    }

    if (typeof IntersectionObserver !== 'undefined') {
      this.viewObserver = new IntersectionObserver((entries) => {
        this.inView = entries.some((entry) => entry.isIntersecting)
      })
      this.viewObserver.observe(this.host)
    }

    this.onContextLost = (event) => {
      event.preventDefault()
      this.paused = true
    }
    this.onContextRestored = () => {
      this.paused = false
      this.#renderOnce()
    }
    this.renderer.domElement.addEventListener('webglcontextlost', this.onContextLost)
    this.renderer.domElement.addEventListener('webglcontextrestored', this.onContextRestored)
  }

  resize() {
    const width = this.host.clientWidth || 1
    const height = this.host.clientHeight || 1
    // 先比较再 setSize：多调一次就是重建缓冲，会闪一帧黑
    if (width === this.width && height === this.height) return

    this.width = width
    this.height = height
    this.renderer.setSize(width, height, false)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.#layout()
    this.#renderOnce()
  }

  #renderOnce() {
    if (this.disposed) return
    this.#updateCamera(0)
    this.renderer.render(this.scene, this.camera)
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    cancelAnimationFrame(this.raf)
    document.removeEventListener('visibilitychange', this.onVisibility)
    this.observer?.disconnect()
    this.viewObserver?.disconnect()
    this.renderer.domElement.removeEventListener('webglcontextlost', this.onContextLost)
    this.renderer.domElement.removeEventListener('webglcontextrestored', this.onContextRestored)

    this.scene.traverse((object) => {
      if (object.geometry) object.geometry.dispose()
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      for (const material of materials) {
        if (!material) continue
        for (const key of Object.keys(material)) {
          const value = material[key]
          if (value && value.isTexture) value.dispose()
        }
        material.dispose()
      }
    })

    this.envTarget?.dispose()
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }
}
