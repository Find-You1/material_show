import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

import { STORY, easeInOutCubic, easeOutCubic, mulberry32 } from './config'
import { groundHeightAt } from './landscape'
import { glowTexture } from './sky'

/**
 * 雪谷里的小姑娘：冰雪奇缘的 Elsa。
 *
 * 人物本身是 Blender 里建好、导出成 models/elsa.glb 的：
 * 躯干、长裙、白金发、侧辫、五官都是网格，层级里带了
 * girl / body / waist / head / armL / armR / elbowL / elbowR /
 * mouth / eyeL / eyeR / browL / browR 这些空物体当关节。
 * 这里只做三件事：加载、按名字取关节、每一帧把姿势写进去。
 *
 * 动作仍然不做骨骼动画：肩 / 颈 / 髋几个转轴 + 时间轴。
 * 长裙盖住腿，所以走路是滑步 + 起伏 + 裙摆摆。
 */

// 站定的落点：卡片左侧空地上，和停在卡片右边的直升机一左一右。
// 这个坐标只是「没有屏幕锚点时的默认值」—— 真正的位置由 AuthScene
// 按卡片左边缘反投影得到，这样 1440 / 1180、登录 / 注册四种情况下
// 她都稳稳站在卡片左边，不会因为镜头往哪边摆而跑出取景框
const END = { x: -17.2, z: 14 }
// 站定后脸朝镜头：机位在 (0, 46)，所以方向角就是这条连线
const CAMERA_FACE = Math.atan2(-END.x, 46 - END.z)

const ELSA_URL = `${import.meta.env.BASE_URL}models/elsa.glb`

// 捧着雪时：上臂只往前抬一点、主要靠肘弯把前臂端平 ——
// 上臂也前伸的话，两只手会在胸前交叉，远看像抱着自己
const CARRY_X = -0.55
const CARRY_Z = 0.2
// 捧雪时肘的弯度：前臂几乎水平，掌心朝上托着那捧雪
const CARRY_ELBOW = -1.15
// 扬雪动作走到这个比例时撒手
const RELEASE = 0.44

const A_STEP = STORY.door
const A_WALK = A_STEP + STORY.step
const A_SMILE = A_WALK + STORY.walk
const A_THROW = A_SMILE + STORY.smile
const A_SPIN = A_THROW + STORY.throw
const A_WAVE = A_SPIN + STORY.spin

const lerp = (a, b, t) => a + (b - a) * t
const clamp01 = (v) => Math.min(1, Math.max(0, v))

export function buildGirl(home, { reduced = false } = {}) {
  const root = new THREE.Group() // 原点在脚底，位置 = 雪面高度
  const body = new THREE.Group() // 起伏、倾斜挂在这一层
  root.add(body)
  // 模型高 2.25 × 2.6：站在表单边约 200px，和门洞（7.1 米高）对得上 ——
  // 3.4 的时候她比家门还高一头，出门那一下整颗头都从门楣上穿过去
  root.scale.setScalar(2.6)

  // ---------- 骨架 ----------
  // 模型是异步到的。先放一批占位节点，update() 在加载完成之前照常跑也不会炸；
  // 到货之后换成 GLB 里的同名节点，时间轴一行都不用改
  let waist = new THREE.Group()
  let headGroup = new THREE.Group()
  let mouth = new THREE.Group()
  let blushMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 })
  // 五官的表情插值按这几个「静止位」算，到货后从模型里读回来
  let MOUTH_Y = -0.08
  let BROW_Y = 0.06
  const eyes = []
  const brows = []
  const arms = {}
  const elbows = {}

  let loaded = false
  new GLTFLoader().load(ELSA_URL, (gltf) => {
    const model = gltf.scene
    const find = (name) => model.getObjectByName(name)

    waist = find('waist') || waist
    headGroup = find('head') || headGroup
    mouth = find('mouth') || mouth
    arms[-1] = find('armL')
    arms[1] = find('armR')
    elbows[-1] = find('elbowL')
    elbows[1] = find('elbowR')
    for (const name of ['eyeL', 'eyeR']) {
      const eye = find(name)
      if (eye) eyes.push(eye)
    }
    for (const name of ['browL', 'browR']) {
      const brow = find(name)
      if (brow) brows.push(brow)
    }
    if (brows[0]) BROW_Y = brows[0].position.y
    if (mouth) MOUTH_Y = mouth.position.y

    // 腮红是半透明的独立材质；glTF 会把它导成 BLEND，这里补上不写深度
    const cheek = find('blushL') || find('blushR')
    if (cheek) {
      blushMaterial = cheek.material
      blushMaterial.depthWrite = false
      blushMaterial.toneMapped = false
    }

    // 模型空间里脸朝 +Z，和原来那套姿势角度完全一致
    body.add(model)
    loaded = true
  })

  const snowMaterial = new THREE.MeshStandardMaterial({
    color: 0xf7fcff,
    roughness: 0.5,
    metalness: 0,
    emissive: 0xa8cbe4,
    emissiveIntensity: 0.55,
  })

  // 脚下一小片软影：没有它，人物像贴纸浮在雪面上。
  // 贴地太高会悬空，太低会被雪面吃掉 —— 5cm 左右刚好压在雪上
  // 影子要比裙摆大一圈：只露出裙边那一线时，在蓝雪上完全读不出来
  const shadowTexture = glowTexture([
    [0, 'rgba(8,18,30,0.85)'],
    [0.42, 'rgba(8,18,30,0.5)'],
    [1, 'rgba(8,18,30,0)'],
  ])
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      map: shadowTexture,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    }),
  )
  shadow.rotation.x = -Math.PI / 2
  shadow.position.y = 0.036
  shadow.scale.set(1.85, 1.3, 1)
  root.add(shadow)

  // ---------- 手里那捧雪 ----------
  // 位置要跟「双手在胸前合拢」之后的手心重合（手大约在 y1.6 / z0.62），
  // 之前放在腰上一大团，远看就是胸前贴了块白圆片
  const carry = new THREE.Group()
  // 雪团要落在两只手心里、而不是挡在手前面：
  // 之前 z 0.58 时手正好陷在雪里，远景读成「胸前悬着一个白球」
  carry.position.set(0, 1.56, 0.52)
  const lumpGeometry = new THREE.SphereGeometry(1, 10, 8)
  for (let i = 0; i < 6; i += 1) {
    const angle = (i / 6) * Math.PI * 2
    const lump = new THREE.Mesh(lumpGeometry, snowMaterial)
    lump.position.set(Math.cos(angle) * 0.048, (i % 2) * 0.036, Math.sin(angle) * 0.036)
    lump.scale.setScalar(0.048 + (i % 3) * 0.009)
    carry.add(lump)
  }
  body.add(carry)

  // ---------- 扬出去的雪 ----------
  // 颗粒要小、数量要多：0.36 的大颗粒在屏幕上是一团肥皂泡，
  // 只有压到 0.2 左右、数量翻倍，才读成「一把雪被扬开」
  const BURST = 320
  const burstPositions = new Float32Array(BURST * 3)
  const burstVelocity = new Float32Array(BURST * 3)
  const burstGeometry = new THREE.BufferGeometry()
  burstGeometry.setAttribute('position', new THREE.BufferAttribute(burstPositions, 3))
  burstGeometry.setDrawRange(0, 0)
  const burstMaterial = new THREE.PointsMaterial({
    size: 0.2,
    map: glowTexture([
      [0, 'rgba(255,255,255,1)'],
      [0.35, 'rgba(232,244,255,0.7)'],
      [1, 'rgba(214,234,255,0)'],
    ]),
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    sizeAttenuation: true,
  })
  const burst = new THREE.Points(burstGeometry, burstMaterial)
  burst.frustumCulled = false
  burst.visible = false

  // ---------- 时间轴 ----------
  const inside = new THREE.Vector3(home.doorInside.x, 0, home.doorInside.z)
  const outside = new THREE.Vector3(home.doorOutside.x, 0, home.doorOutside.z)
  const endPoint = new THREE.Vector3(END.x, 0, END.z)
  const stepAngle = Math.atan2(outside.x - inside.x, outside.z - inside.z)

  const seed = mulberry32(4821)
  let walkPhase = 0
  let doorK = 0
  let carried = true
  // 笑意的连续值：目标 0 或 1，实际值每帧向目标逼近
  let smileK = 0
  let released = false
  let burstAge = -1

  function throwSnow() {
    // 撒手点在胸前（下巴下面一点）：从这里往两侧甩出去。
    // 起点放到脸那么高再往上抛的话，机位是从上往下看，
    // 整团雪会正好糊在她五官上 —— 第一版就是这样，像一台造雪机
    const origin = root.localToWorld(new THREE.Vector3(0, 1.58, 0.6))
    for (let i = 0; i < BURST; i += 1) {
      const angle = seed() * Math.PI * 2
      const radius = Math.sqrt(seed())
      // 横向速度远大于纵向：一团横向铺开、缓慢升起的雪，读起来才是「扬出去」。
      // 纵向给到 2~3 米/秒，雪才会先向上拱一下再落 —— 纯横向是一条水线
      const speed = 3.4 + seed() * 3.2
      burstPositions[i * 3] = origin.x + Math.cos(angle) * radius * 0.14
      burstPositions[i * 3 + 1] = origin.y + (seed() - 0.5) * 0.16
      burstPositions[i * 3 + 2] = origin.z + Math.sin(angle) * radius * 0.1
      burstVelocity[i * 3] = Math.cos(angle) * radius * speed
      burstVelocity[i * 3 + 1] = 1.9 + seed() * 1.4
      burstVelocity[i * 3 + 2] = Math.sin(angle) * radius * speed * 0.55 + 0.3
    }
    burstGeometry.setDrawRange(0, BURST)
    burstGeometry.attributes.position.needsUpdate = true
    burstAge = 0
    burst.visible = true
    burstMaterial.opacity = 1
  }

  function updateBurst(dt) {
    if (burstAge < 0) return
    burstAge += dt
    for (let i = 0; i < BURST; i += 1) {
      burstVelocity[i * 3 + 1] -= 4.4 * dt
      burstPositions[i * 3] += burstVelocity[i * 3] * dt
      burstPositions[i * 3 + 1] += burstVelocity[i * 3 + 1] * dt
      burstPositions[i * 3 + 2] += burstVelocity[i * 3 + 2] * dt
    }
    burstGeometry.attributes.position.needsUpdate = true
    // 雪落地之前就化掉：淡出比让它们堆在雪面上更干净
    burstMaterial.opacity = Math.max(0, 1 - burstAge / 1.9)
    if (burstAge > 1.9) {
      burstAge = -1
      burst.visible = false
      burstGeometry.setDrawRange(0, 0)
    }
  }

  function applyPose({
    armLx,
    armLz,
    armRx,
    armRz,
    elbowL = -0.16,
    elbowR = -0.16,
    // 肘的侧弯：正值让左小臂往里收、负值让右小臂往里收。
    // 正面看时前弯（rotation.x）会被透视吃掉，只有这一项能画出「手臂的弧线」
    elbowLz = 0.28,
    elbowRz = -0.28,
    headTilt,
    headNod,
    bob,
    headBob = 0,
    roll = 0,
    squash = 1,
    spin = 0,
    skirtSway = 0,
    skirtFlare = 1,
    skirtTilt = 0,
    skirtDrop = 1,
    // 笑的程度 0~1：嘴角、眼睛、眉毛、腮红一起插值，
    // 不是「笑 / 不笑」两套切换 —— 二值切换在远景里就是一张死脸
    smile = 0,
  }) {
    if (!loaded) return
    body.position.y = bob
    body.rotation.z = roll
    body.rotation.x = spin
    body.scale.set(1 + (1 - squash) * 0.4, squash, 1 + (1 - squash) * 0.4)
    // side === -1 是画面里的左手，+1 是右手
    arms[-1].rotation.set(armLx, 0, armLz)
    arms[1].rotation.set(armRx, 0, armRz)
    // 肘关节只往前弯（负值是往前）：伸直的手臂在这个尺寸读起来像衣架
    elbows[-1].rotation.set(elbowL, 0, elbowLz)
    elbows[1].rotation.set(elbowR, 0, elbowRz)
    headGroup.rotation.set(headNod + headBob, 0, headTilt - roll * 0.5)
    // 裙摆从腰线甩出去：外扩 + 侧摆 + 前后倾，全部作用在腰以下那一层，
    // 上身的侧弯不会把它带裂，腰带正好盖住两层的接缝
    waist.rotation.z = skirtSway
    waist.rotation.x = skirtTilt
    waist.scale.set(skirtFlare, skirtDrop, skirtFlare)

    const sm = clamp01(smile)
    // 嘴角：一片薄弧 → 张开、下垂的月牙。宽度同时打开一点，才像真的在笑
    mouth.scale.set(0.92 + sm * 0.28, 0.78 + sm * 1.2, 1)
    mouth.position.y = MOUTH_Y + sm * 0.004
    // 眼睛眯起来：笑眼比睁大眼更传神，也最能在 30px 的头里读出来。
    // 左眼的节点在 GLB 里带了 (-1,1,1) 的镜像缩放，直接 setScalar 会把镜像冲掉
    for (const eye of eyes) {
      const k = 1 - 0.16 * sm
      eye.scale.set((eye.scale.x < 0 ? -1 : 1) * k, k, k)
    }
    for (const brow of brows) brow.position.y = BROW_Y + sm * 0.008
    blushMaterial.opacity = 0.05 + sm * 0.2
  }

  function update(dt, storyT, anchor) {
    updateBurst(dt)

    // 屏幕锚点由 AuthScene 每帧给出：卡片左边缘往左一点、贴地的那一点。
    // 只取 x —— z 保持在她自己的深度上，免得她忽远忽近
    if (anchor) endPoint.x = anchor.x
    const cameraFace = Math.atan2(-endPoint.x, 46 - endPoint.z)

    // 剧情没开始：她还关在屋里，门也是关的
    if (storyT < 0 || reduced) {
      if (reduced && storyT >= 0) {
        // 减弱动效：不演走路和转圈，直接站在表单边，笑着轻轻晃
        root.visible = true
        root.position.set(endPoint.x, groundHeightAt(endPoint.x, endPoint.z), endPoint.z)
        root.rotation.y = cameraFace
        applyPose({
          armLx: -0.08,
          armLz: -0.22,
          armRx: -0.08,
          armRz: 0.22,
          headTilt: 0.1,
          headNod: -0.06,
          bob: 0,
          smile: 1,
        })
        carry.visible = false
        smileK = 1
        home.setDoor(0)
        return
      }
      root.visible = false
      home.setDoor(0)
      doorK = 0
      return
    }

    root.visible = true
    const t = storyT

    let x = endPoint.x
    let z = endPoint.z
    let stepX = 0 // 原地蹦跳的横向位移（相对落点）
    let faceAngle = cameraFace
    let armLx = -0.08
    let armLz = -0.12
    let armRx = -0.08
    let armRz = 0.12
    let hop = 0
    let headTilt = 0.04
    let headNod = 0
    let doorTarget = 0
    let skirtSway = 0
    let skirtFlare = 1
    let skirtTilt = 0
    let squash = 1
    let roll = 0
    // 上身前后俯仰（致意时用，绕脚底转，幅度大了裙摆会插进雪里）
    let bow = 0
    let walkAmount = 0
    // 肘关节：捧雪时收得最紧，扬雪那一下伸直，其余保持放松的微弯
    let elbowL = -0.16
    let elbowR = -0.16
    let elbowLz = 0.28
    let elbowRz = -0.28
    // 手里那捧雪跟着手走：抬起时一起抬高，撒出去之后整组隐藏
    let carryLift = 0
    // 笑意目标：站定那一刻起就笑着，之后再也不收
    let smileTarget = 0

    if (t < A_STEP) {
      // 门开：她还在屋里，只有门板和门口的暖气在动
      doorTarget = easeOutCubic(clamp01(t / STORY.door))
      x = inside.x
      z = inside.z
      faceAngle = stepAngle
      armLx = CARRY_X
      armLz = CARRY_Z
      armRx = CARRY_X
      armRz = -CARRY_Z
      elbowL = CARRY_ELBOW
      elbowR = CARRY_ELBOW
      // 肘只往内收一点点：收多了两只手会在雪团后面并在一起，
      // 从正面就只剩一个白球浮在胸前，读不出「捧」
      elbowLz = 0.12
      elbowRz = -0.12
    } else if (t < A_WALK) {
      // 迈出门槛：先走两步，门还开着
      const k = easeInOutCubic(clamp01((t - A_STEP) / STORY.step))
      x = lerp(inside.x, outside.x, k)
      z = lerp(inside.z, outside.z, k)
      faceAngle = stepAngle
      walkAmount = Math.min(1, k * 2.5)
      doorTarget = 1
      armLx = CARRY_X
      armLz = CARRY_Z
      armRx = CARRY_X
      armRz = -CARRY_Z
      elbowL = CARRY_ELBOW
      elbowR = CARRY_ELBOW
      // 肘只往内收一点点：收多了两只手会在雪团后面并在一起，
      // 从正面就只剩一个白球浮在胸前，读不出「捧」
      elbowLz = 0.12
      elbowRz = -0.12
    } else if (t < A_SMILE) {
      // 捧雪走到表单左下角；快到时把身体从走路方向转到镜头方向
      const k = easeInOutCubic(clamp01((t - A_WALK) / STORY.walk))
      x = lerp(outside.x, endPoint.x, k)
      z = lerp(outside.z, endPoint.z, k)
      const walkAngle = Math.atan2(endPoint.x - outside.x, endPoint.z - outside.z)
      faceAngle = lerp(walkAngle, cameraFace, clamp01((k - 0.78) / 0.22))
      walkAmount = 1
      doorTarget = 1
      armLx = CARRY_X
      armLz = CARRY_Z
      armRx = CARRY_X
      armRz = -CARRY_Z
      elbowL = CARRY_ELBOW
      elbowR = CARRY_ELBOW
      // 肘只往内收一点点：收多了两只手会在雪团后面并在一起，
      // 从正面就只剩一个白球浮在胸前，读不出「捧」
      elbowLz = 0.12
      elbowRz = -0.12
      smileTarget = 1
    } else if (t < A_THROW) {
      // 站定、仰头、笑 —— 笑意从这一下开始
      const k = clamp01((t - A_SMILE) / 0.45)
      hop = Math.sin(k * Math.PI) * 0.14
      headTilt = 0.1 * k
      headNod = -0.18 * k
      doorTarget = 1
      armLx = CARRY_X + 0.06
      armLz = CARRY_Z - 0.04
      armRx = CARRY_X + 0.06
      armRz = -CARRY_Z + 0.04
      elbowL = CARRY_ELBOW
      elbowR = CARRY_ELBOW
      // 肘只往内收一点点：收多了两只手会在雪团后面并在一起，
      // 从正面就只剩一个白球浮在胸前，读不出「捧」
      elbowLz = 0.12
      elbowRz = -0.12
      smileTarget = 1
    } else if (t < A_SPIN) {
      const k = (t - A_THROW) / STORY.throw
      headNod = -0.2
      doorTarget = 1
      smileTarget = 1
      if (k < RELEASE) {
        // 捧着雪的双臂从胸前抬到下巴前，手一直并在一起
        const lift = easeOutCubic(k / RELEASE)
        const armX = lerp(CARRY_X, -1.55, lift)
        armLx = armX
        armRx = armX
        armLz = lerp(CARRY_Z, 0.24, lift)
        armRz = -armLz
        carryLift = lift
        headTilt = 0.08
        hop = lift * 0.05
        // 手臂抬高时肘跟着伸直，否则手会一直缩在脸前面
        elbowL = lerp(CARRY_ELBOW, -0.3, lift)
        elbowR = elbowL
      } else {
        if (!released) {
          released = true
          carried = false
          throwSnow()
        }
        // 撒手后的收势：手顺势往前上方带一下，再落回身前
        const fall = (k - RELEASE) / (1 - RELEASE)
        const armX = lerp(-1.55, -1.15, easeOutCubic(fall))
        armLx = armX
        armRx = armX
        armLz = lerp(0.24, 0.2, fall)
        armRz = -armLz
        hop = Math.sin(fall * Math.PI) * 0.12
        headNod = -0.06
        squash = 1 - Math.sin(fall * Math.PI) * 0.02
        elbowL = -0.3 - Math.sin(fall * Math.PI) * 0.2
        elbowR = elbowL
      }
    } else if (t < A_WAVE) {
      // 撒完雪先转一圈：手臂张开，裙摆甩开
      const k = (t - A_SPIN) / STORY.spin
      const e = easeInOutCubic(k)
      faceAngle = cameraFace + e * Math.PI * 2
      hop = Math.sin(k * Math.PI) * 0.2
      skirtFlare = 1 + Math.sin(k * Math.PI) * 0.22
      skirtSway = Math.sin(k * Math.PI * 2) * 0.12
      headTilt = 0.14
      armLx = -0.3
      armRx = -0.3
      armLz = -0.95
      armRz = 0.95
      elbowL = -0.35
      elbowR = -0.35
      smileTarget = 1
      doorTarget = 1
    } else {
      // 之后的常态：在画面下方跳一支 6.4 秒一轮的小舞。
      // 不是蹦跶，而是舞者的动作顺序：起手 → 换侧 → 转圈 → 屈膝致意 → 收势招手。
      // 每段用半个正弦拼，段落之间回到「芭蕾站姿」，不会有跳变
      const idle = t - A_WAVE
      const cycle = idle % 6.4
      const bump = (a, b) => {
        const q = (cycle - a) / (b - a)
        return q > 0 && q < 1 ? Math.sin(q * Math.PI) : 0
      }

      // 基础位：手臂离开身体一点点、肘弯出一点弧 —— 芭蕾的准备位。
      // 手不贴身、也不端平，落在胯前一点的位置
      carried = false
      smileTarget = 1
      // 边跳边在雪地上走位：两个不同周期的正弦叠出一条不闭合的弧线，
      // 她就在表单左下这块空地上来回移动 —— 原地比划手臂读起来是「机械舞」
      const wanderX = Math.sin(idle * 0.44) * 1.25
      const wanderZ = Math.sin(idle * 0.31) * 0.7
      x = endPoint.x + wanderX
      z = endPoint.z + wanderZ
      walkAmount = 0.9
      const travel = Math.atan2(
        Math.cos(idle * 0.44) * 1.25 * 0.44,
        Math.cos(idle * 0.31) * 0.7 * 0.31,
      )
      armLx = -0.12
      armLz = -0.2
      armRx = -0.12
      armRz = 0.2
      elbowL = -0.32
      elbowR = -0.32
      elbowLz = 0.16
      elbowRz = -0.16
      hop = Math.abs(Math.sin(idle * 1.9)) * 0.01
      roll = Math.sin(idle * 1.3) * 0.01
      headTilt = 0.05
      // 极轻的重心左右移 + 身体随节拍小幅度转向：
      // 只靠手臂动会像机械臂，这两下才是「人在跳舞」。
      // 幅度都必须很小 —— 整个 body 是绕 Y 转的，yaw 一给大，
      // 远景里就是全身左右扭摆，而不是舞步
      const yaw = Math.sin(idle * 0.7) * 0.045
      // 走动时脸朝行进方向一点点、剩下仍看镜头：完全侧过去就看不到笑了。
      // 这一项不能大：整根身体绕 Y 转，0.16 rad 就够她一路左右拧
      faceAngle = cameraFace + yaw + Math.sin(travel - cameraFace) * 0.06
      stepX = Math.sin(idle * 1.3) * 0.03
      skirtSway = Math.sin(idle * 1.1) * 0.03
      skirtFlare = 1.01

      // 起手：一条手臂向外上方画弧，小臂顺着弧线往外上方抬，身体向另一侧倾，裙摆反向荡开。
      // 抬臂幅度收着点（0.56，约 32°）：再往上就是一条横伸的直臂，远景里读成 T 字体操
      const leftRise = bump(0.4, 1.65)
      armLz -= leftRise * 0.56
      armLx -= leftRise * 0.3
      // 抬起来的那条胳膊要「一条弧到底」：把小臂的侧弯反而解开，
      // 手掌顺着弧线往外上方走；继续往里收就成了手肘外翻、手垂在腰边的鸡翅
      elbowLz -= leftRise * 0.5
      elbowL -= leftRise * 0.45
      armRz += leftRise * 0.22
      elbowRz -= leftRise * 0.1
      roll -= leftRise * 0.018
      headTilt += leftRise * 0.12
      skirtSway -= leftRise * 0.08
      stepX -= leftRise * 0.025
      skirtFlare += leftRise * 0.05

      // 换侧：镜像
      const rightRise = bump(1.75, 2.95)
      armRz += rightRise * 0.56
      armRx -= rightRise * 0.3
      elbowRz += rightRise * 0.5
      elbowR -= rightRise * 0.45
      armLz -= rightRise * 0.22
      elbowLz += rightRise * 0.1
      roll += rightRise * 0.018
      headTilt -= rightRise * 0.12
      skirtSway += rightRise * 0.08
      stepX += rightRise * 0.025
      skirtFlare += rightRise * 0.04

      // 转圈：整圈 2π，双臂随离心甩开、裙摆整圈荡出去，
      // 转完还有一点滞后的回摆 —— 裙摆的重量感靠这一下
      const spinK = clamp01((cycle - 3.05) / 1.05)
      const spinE = easeInOutCubic(spinK)
      const swirling = Math.sin(spinK * Math.PI)
      faceAngle = cameraFace + yaw + spinE * Math.PI * 2
      armLz -= swirling * 0.62
      armRz += swirling * 0.62
      elbowLz -= swirling * 0.05
      elbowRz += swirling * 0.05
      hop += swirling * 0.05
      headTilt += swirling * 0.12
      skirtFlare += swirling * 0.38
      skirtSway += Math.sin(spinK * Math.PI * 2 - 0.9) * swirling * 0.22
      skirtTilt -= swirling * 0.06

      // 屈膝致意：上身微微前倾，双臂向两侧打开、手心朝下
      const curtsy = bump(4.25, 5.35)
      bow = curtsy * 0.07
      hop += curtsy * 0.03
      squash -= curtsy * 0.03
      armLz -= curtsy * 0.4
      armRz += curtsy * 0.4
      elbowLz += curtsy * 0.1
      elbowRz -= curtsy * 0.1
      headNod += curtsy * 0.24
      skirtFlare += curtsy * 0.08
      skirtTilt += curtsy * 0.07

      // 收势：直起身，右手轻轻一举
      const farewell = bump(5.55, 6.05)
      armRz += farewell * 0.5
      elbowRz -= farewell * 0.15
      elbowR -= farewell * 0.2
      headTilt -= farewell * 0.05
      doorTarget = 1
    }

    // 长裙盖住腿：走路靠起伏 + 裙摆前后摆，不再有腿的相位。
    // 身体的左右 roll 必须压到很小 —— 之前 0.075 rad，远景里就是一路左右扭，
    // 真实的人走路是上下起伏 + 轻微前后倾，左右晃只该出现在失控的时候
    walkPhase += dt * 7.4
    if (walkAmount) {
      const swing = Math.sin(walkPhase)
      hop += Math.abs(swing) * 0.055 * walkAmount
      roll += swing * 0.009 * walkAmount
      stepX += swing * 0.006 * walkAmount
      skirtSway += swing * 0.05 * walkAmount
      skirtTilt += swing * 0.03 * walkAmount
      armLx += swing * 0.025 * walkAmount
      armRx -= swing * 0.025 * walkAmount
      headNod += Math.sin(walkPhase * 2) * 0.018 * walkAmount
      headTilt += swing * 0.004 * walkAmount
      // 走起来上身微微前倾，重心落在前脚掌上
      bow += 0.012 * walkAmount
    }

    const px = x + stepX
    const groundY = groundHeightAt(px, z)
    root.position.set(px, groundY + hop, z)
    root.rotation.y = faceAngle
    carry.visible = carried
    carry.position.y = 1.56 + carryLift * 0.34
    carry.position.z = 0.52 + carryLift * 0.05
    // 软影永远贴地：跳起来时缩小、变淡，落地时铺开。
    // 影子是 root 的子节点，用世界尺度换算，人物缩放改了也不会错位
    shadow.position.y = (-hop + 0.05) / root.scale.x
    shadow.scale.set(1.8 - hop * 0.7, 1.26 - hop * 0.5, 1)

    // 笑意平滑：从 0 渐渐涨到 1，之后在 1 附近轻轻起伏，
    // 不会像开关一样「啪」地换一张脸
    smileK += (smileTarget - smileK) * (1 - Math.exp(-5 * dt))
    const giggle = t > A_WAVE ? Math.sin((t - A_WAVE) * 2.3) * 0.07 : 0

    applyPose({
      armLx,
      armLz,
      armRx,
      armRz,
      elbowL,
      elbowR,
      elbowLz,
      elbowRz,
      headTilt,
      headNod,
      bob: 0,
      headBob: Math.sin(walkPhase * 2) * 0.02 * walkAmount,
      roll,
      squash,
      spin: bow,
      skirtSway,
      skirtFlare,
      skirtTilt,
      smile: clamp01(smileK + giggle),
    })

    // 门：开门是匀着的，关门不用（她不会再回去）
    doorK += (doorTarget - doorK) * (1 - Math.exp(-9 * dt))
    home.setDoor(doorK)
  }

  home.setDoor(0)
  // 剧情没开始之前先别画：她的起点在屋里，但首帧的矩阵还没落位
  root.visible = false

  return { group: root, burst, update }
}
