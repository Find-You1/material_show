import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

import { frameAt } from './path'

/**
 * 海岸那一层：路外先是一段向下的沙滩，再往外整片动态的海。
 *
 * 只属于 Coast 主题 —— 整组默认 `visible = false`，其余主题连一次绘制都不会有。
 * 海面是唯一有动画的地面：顶点完全不动，靠片元着色器把时间写进波纹，
 * 所以不会影响碰撞、画框高度和车的位置。
 */

// 沙滩要亮一档：这条带子是画面里最大的一块地面，暗下去又变成黑地。
// 但也不能太白 —— 沙比海还抢眼时，整张照片就只剩「一块沙漠」
const SAND = 0xcfba92

// 沙坡从护栏外侧 7.2 米处起坡（画框立在 6.6 米，要先给它们一块平地），
// 一路降到 30 米外的水下。这段坡必须顶替掉主题共用的 30 米水平路肩：
// 水平路肩在 3.4 米视高下会把 30 米外的一切压在地平线以下，
// 海永远是地平线上一条看不清的细线（之前的「只有沙没有海」就是这么来的）
const BEACH_INNER = 7.2
const BEACH_OUTER = 30
const BEACH_DROP = 4.3

// 海面 -2.9 米，比沙坡外沿（-4.3）高一截：沙子在 22 米处沉到水面以下，
// 那里就是海岸线，水从岸线一直铺到 300 米。
// 反过来把海放在沙沿之下（之前是 -4.4 对 -4.2），视线越过沙沿后一路向下，
// 整片海被沙沿挡在背后，画面里只剩一大块沙地。
// 岸线离路越近，海在画面里占的高度越大（俯角越大），沙带也越窄
const SEA_DROP = 2.9
// 海的内沿落在沙坡底下（18 米处），先在沙下面藏着，到岸线才露出来
const SEA_INNER = 18
// 海的宽度：铺到 400 米，尽头在 190~380m 的雾里化干净。
// 再宽，环路远段（路面可能高 37 米）的水面就会从地平线上面冒出来，
// 看起来像极光；太窄则会在海里留一条硬边
const SEA_OUTER = 400

/**
 * 沿曲线铺一条朝外张开的带子，两条边各自给高度偏移 ——
 * 沙滩用它做缓坡，海面用它整片下沉。
 */
function buildBandGeometry(curve, lateralA, lateralB, yA, yB, segments = 700) {
  const positions = []
  const indices = []
  // 横向进度：0 是内沿（靠沙滩），1 是外沿。海面用它刷出贴岸的白沫带
  const edges = []

  for (let i = 0; i <= segments; i += 1) {
    const frame = frameAt(curve, i / segments)
    const a = frame.point.clone().addScaledVector(frame.right, lateralA)
    const b = frame.point.clone().addScaledVector(frame.right, lateralB)
    a.y += yA
    b.y += yB

    positions.push(a.x, a.y, a.z, b.x, b.y, b.z)
    edges.push(0, 1)
    if (i < segments) {
      const k = i * 2
      indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2)
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('vEdge', new THREE.Float32BufferAttribute(edges, 1))
  geometry.setIndex(indices)
  return geometry
}

// 顶点只负责把世界坐标传给片元；水面是平的，不需要任何变形
const WATER_VERTEX = `
  attribute float vEdge;
  varying vec3 vWorld;
  varying float vShore;

  void main() {
    vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
    vShore = vEdge;
    gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
  }
`

// 三层波纹叠在一起：大涌浪负责缓慢起伏，细浪负责碎光，带子负责深浅分区。
// 远处直接混进雾色，海天交界才不会出现一条硬边。
const WATER_FRAGMENT = `
  uniform float uTime;
  uniform float uFade;
  uniform vec3 uDeep;
  uniform vec3 uShallow;
  uniform vec3 uFoam;
  uniform vec3 uFog;

  varying vec3 vWorld;
  varying float vShore;

  void main() {
    vec2 p = vWorld.xz;

    float swell = sin(p.x * 0.055 + uTime * 0.42) * cos(p.y * 0.048 - uTime * 0.36);
    float chop = sin(p.x * 0.19 - uTime * 0.9 + p.y * 0.16);
    float band = sin(p.y * 0.075 + uTime * 0.55) * 0.5 + 0.5;

    vec3 color = mix(uDeep, uShallow, 0.36 + band * 0.16);

    float crest = smoothstep(0.45, 0.95, swell * 0.5 + 0.5);
    color = mix(color, uFoam, crest * 0.1 + smoothstep(0.9, 1.0, chop) * 0.07);

    // 阳光在涌浪上的碎光：只在浪尖出现的一簇簇亮点，位置随时间缓慢移动
    float glint = pow(max(0.0, sin(p.x * 0.31 + p.y * 0.23 - uTime * 0.9)), 26.0);
    color = mix(color, uFoam, glint * 0.3 * crest);

    // 贴岸的白沫：一条会呼吸的窄带，海和沙滩之间不再是硬边
    float shore = smoothstep(0.05, 0.0, vShore);
    float foam = 0.5 + 0.5 * sin(p.x * 0.55 + p.y * 0.4 - uTime * 1.25);
    color = mix(color, uFoam, shore * (0.36 + 0.4 * foam));

    float distance = length(p - cameraPosition.xz);
    // 远处的海要化进「地平线雾」，而不是化进夜空：混早了整片海跟背景一样黑，
    // 默认视角里几乎看不见。留到 190m 之后再混，近处的海一直保持青色
    color = mix(color, uFog, smoothstep(190.0, 380.0, distance));

    // 切主题时整片海淡入淡出：海占画面三分之一，硬开关会「啪」地闪一下。
    // 海是不透明材质，所以用「混回雾色」代替透明度，边缘才不会露馅
    color = mix(uFog, color, uFade);

    gl_FragColor = vec4(color, 1.0);
  }
`



/** 沙滩上某个横向距离的沙面高度（从路肩 0 一路降到外沿） */
function beachHeight(lateral) {
  const t = Math.min(1, Math.max(0, (Math.abs(lateral) - BEACH_INNER) / (BEACH_OUTER - BEACH_INNER)))
  return -t * BEACH_DROP
}

/** 统一开透明：海岸上的东西都要跟着主题一起淡入淡出 */
function fading(material) {
  material.transparent = true
  material.opacity = 0
  return material
}

/** 棕榈树：七片下垂的叶子合成一份几何，树干单独一份（两种材质、两批实例） */
function buildPalmFronds() {
  const fronds = []
  for (let i = 0; i < 7; i += 1) {
    const frond = new THREE.ConeGeometry(0.34, 2.15, 4)
    // 压扁成叶片，锥轴 +Y 转到 +X：叶根在原点、叶尖朝外
    frond.scale(1, 1, 0.2)
    frond.rotateZ(-Math.PI / 2)
    frond.translate(1.05, 0, 0)
    // 叶尖再垂下去一点，不然像一把伞
    frond.rotateZ(-0.34)
    frond.rotateY((i / 7) * Math.PI * 2)
    frond.translate(0, 4.5, 0)
    fronds.push(frond)
  }
  return mergeGeometries(fronds)
}

/** 灯塔：白色塔身 + 红色腰带 + 发光灯室，只在海岸出现，远远地立着当参照物 */
function buildLighthouse() {
  const group = new THREE.Group()

  const tower = new THREE.Mesh(
    new THREE.CylinderGeometry(1.05, 1.8, 12, 12),
    fading(new THREE.MeshStandardMaterial({ color: 0xece7dc, roughness: 0.86, metalness: 0.05 })),
  )
  tower.position.y = 6

  const band = new THREE.Mesh(
    new THREE.CylinderGeometry(1.16, 1.34, 2.1, 12),
    fading(new THREE.MeshStandardMaterial({ color: 0xa8362a, roughness: 0.8 })),
  )
  band.position.y = 8.3

  const lamp = new THREE.Mesh(
    new THREE.CylinderGeometry(0.82, 0.82, 1.15, 12),
    fading(new THREE.MeshBasicMaterial({ color: 0xffe3a8, toneMapped: false })),
  )
  lamp.position.y = 12.4

  const cap = new THREE.Mesh(
    new THREE.ConeGeometry(1.16, 1.5, 12),
    fading(new THREE.MeshStandardMaterial({ color: 0x2b2b30, roughness: 0.72 })),
  )
  cap.position.y = 13.7

  group.add(tower, band, lamp, cap)
  return group
}

/** 帆船：船体 + 桅杆 + 一面白帆，停在外海当远景的一点人味 */
function buildBoat(hullMaterial, sailMaterial) {
  const group = new THREE.Group()

  const hull = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.9, 1.3), hullMaterial)
  hull.position.y = 0.35

  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 3.2, 5), hullMaterial)
  mast.position.set(0.1, 2.2, 0)

  const sail = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 2.7, 1, 1), sailMaterial)
  sail.position.set(0.55, 2.45, 0)

  group.add(hull, mast, sail)
  return group
}

export function buildCoast(curve) {
  const group = new THREE.Group()
  const random = (() => {
    let seed = 20261021
    return () => {
      seed = (seed * 1664525 + 1013904223) >>> 0
      return seed / 4294967296
    }
  })()

  const beachMaterial = new THREE.MeshBasicMaterial({
    color: SAND,
    side: THREE.DoubleSide,
    // 沙滩也参与主题淡入淡出；不透明平板直接出现同样是「闪一下」
    transparent: true,
    opacity: 0,
  })
  const beachGroup = new THREE.Group()
  // 三块拼起来：路沿到 7.2 米的平沙（画框要立在这上面）、
  // 7.2 到 31 米的沙坡、再往外就是水面。主题共用的 30 米水平路肩在
  // 海岸主题里会被藏掉（见 MonochromeRoad 的 setTheme），由这三块顶替
  for (const side of [-1, 1]) {
    beachGroup.add(
      new THREE.Mesh(
        buildBandGeometry(curve, side * 3.5, side * BEACH_INNER, -0.03, -0.03),
        beachMaterial,
      ),
      new THREE.Mesh(
        buildBandGeometry(curve, side * BEACH_INNER, side * BEACH_OUTER, -0.03, -BEACH_DROP),
        beachMaterial,
      ),
    )
  }
  group.add(beachGroup)

  // 海面也是沿路的带子（不是恒高圆盘）：这样海岸落差恒定，
  // 海不会被宽路肩压到地平线后面看不见。
  // 带宽收到 200 米、配合 170 米处的全雾，远段路面的「高水位」不会冒到天上。
  const waterUniforms = {
    uTime: { value: 0 },
    uFade: { value: 0 },
    // 着色器里的颜色是线性空间，乘 1.25 抵掉 Neutral 色调映射对暗部的压缩。
    // 海必须比沙滩亮一档，否则夜里就是一片黑水，看不出是海
    uDeep: { value: new THREE.Color(0x27718c).multiplyScalar(1.35) },
    uShallow: { value: new THREE.Color(0x55c2d2).multiplyScalar(1.35) },
    uFoam: { value: new THREE.Color(0xc4e2e6) },
    // 海自己的「雾」比夜空亮一档：远处的水面才会在深色背景上留一条边
    uFog: { value: new THREE.Color(0x1d4b58) },
  }
  const waterMaterial = new THREE.ShaderMaterial({
    uniforms: waterUniforms,
    vertexShader: WATER_VERTEX,
    fragmentShader: WATER_FRAGMENT,
    side: THREE.DoubleSide,
    fog: false,
  })

  const waterGroup = new THREE.Group()
  for (const side of [-1, 1]) {
    const geometry = buildBandGeometry(
      curve,
      side * SEA_INNER,
      side * SEA_OUTER,
      -SEA_DROP,
      -SEA_DROP,
    )
    waterGroup.add(new THREE.Mesh(geometry, waterMaterial))
  }
  group.add(waterGroup)

  // ---- 棕榈树：沿沙滩排成两列，树干与叶子两批实例共用一组矩阵 ----
  const trunkMaterial = fading(
    new THREE.MeshStandardMaterial({ color: 0x6b5a42, roughness: 0.95, metalness: 0 }),
  )
  const frondMaterial = fading(
    new THREE.MeshStandardMaterial({
      color: 0x2f6a48,
      roughness: 0.9,
      metalness: 0,
      // 沙滩很亮，叶子不带一点自发光会黑成一团
      emissive: 0x1b3f28,
      emissiveIntensity: 0.4,
    }),
  )
  const palms = []
  for (let u = 0; u < 1; u += 15 / curve.getLength()) {
    for (const side of [-1, 1]) {
      if (random() > 0.55) continue
      palms.push({
        u,
        lateral: side * (11 + random() * 11),
        scale: 0.8 + random() * 0.5,
        yaw: random(),
      })
    }
  }
  const trunkGeometry = new THREE.CylinderGeometry(0.13, 0.26, 4.6, 6)
  trunkGeometry.translate(0, 2.3, 0)
  const frondGeometry = buildPalmFronds()
  const trunks = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, palms.length)
  const fronds = new THREE.InstancedMesh(frondGeometry, frondMaterial, palms.length)
  const palmMatrix = new THREE.Matrix4()
  const palmQuaternion = new THREE.Quaternion()
  const palmScale = new THREE.Vector3()
  palms.forEach((item, index) => {
    const frame = frameAt(curve, item.u)
    const position = frame.point.clone().addScaledVector(frame.right, item.lateral)
    position.y += beachHeight(item.lateral) - 0.1
    palmQuaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), item.yaw * Math.PI * 2)
    palmScale.setScalar(item.scale)
    palmMatrix.compose(position, palmQuaternion, palmScale)
    trunks.setMatrixAt(index, palmMatrix)
    fronds.setMatrixAt(index, palmMatrix)
  })
  trunks.instanceMatrix.needsUpdate = true
  fronds.instanceMatrix.needsUpdate = true
  trunks.frustumCulled = false
  fronds.frustumCulled = false
  const palmGroup = new THREE.Group()
  palmGroup.add(trunks, fronds)
  group.add(palmGroup)

  // ---- 灯塔：固定在路的 31% 处，远远立着当海岸的参照物 ----
  const lighthouse = buildLighthouse()
  const lighthouseFrame = frameAt(curve, 0.31)
  lighthouse.position
    .copy(lighthouseFrame.point)
    .addScaledVector(lighthouseFrame.right, 20)
  lighthouse.position.y += beachHeight(20) - 0.3
  group.add(lighthouse)

  // ---- 礁石：从沙滩外沿一直伸进水里，让海和滩之间有过渡 ----
  const shoreRockMaterial = fading(
    new THREE.MeshStandardMaterial({
      color: 0x5f594d,
      roughness: 0.92,
      metalness: 0.04,
      flatShading: true,
    }),
  )
  const shoreRockGeometry = new THREE.IcosahedronGeometry(1, 0)
  const shoreRockPositions = []
  for (let u = 0; u < 1; u += 11 / curve.getLength()) {
    for (const side of [-1, 1]) {
      if (random() > 0.45) continue
      shoreRockPositions.push({
        u,
        lateral: side * (23 + random() * 7),
        scale: 0.9 + random() * 1.9,
        yaw: random(),
      })
    }
  }
  const shoreRocks = new THREE.InstancedMesh(
    shoreRockGeometry,
    shoreRockMaterial,
    shoreRockPositions.length,
  )
  shoreRockPositions.forEach((item, index) => {
    const frame = frameAt(curve, item.u)
    const position = frame.point.clone().addScaledVector(frame.right, item.lateral)
    // 半沉在水里：露出水面的部分刚好当礁石
    position.y += -SEA_DROP - 0.15 - random() * 0.6
    palmQuaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), item.yaw * Math.PI * 2)
    palmScale.set(item.scale * 1.4, item.scale * 0.75, item.scale)
    palmMatrix.compose(position, palmQuaternion, palmScale)
    shoreRocks.setMatrixAt(index, palmMatrix)
  })
  shoreRocks.instanceMatrix.needsUpdate = true
  shoreRocks.frustumCulled = false
  group.add(shoreRocks)

  // ---- 帆船：三艘停在外海，离得远，只作为一点尺度参照 ----
  const hullMaterial = fading(
    new THREE.MeshStandardMaterial({ color: 0x22323e, roughness: 0.6, metalness: 0.12 }),
  )
  const sailMaterial = fading(
    new THREE.MeshStandardMaterial({
      color: 0xf4f1e8,
      roughness: 0.85,
      side: THREE.DoubleSide,
    }),
  )
  const boatGroup = new THREE.Group()
  for (const [u, lateral, yaw] of [
    [0.06, 96, 0.8],
    [0.41, 132, -1.1],
    [0.68, 108, 2.4],
  ]) {
    const boat = buildBoat(hullMaterial, sailMaterial)
    const frame = frameAt(curve, u)
    boat.position.copy(frame.point).addScaledVector(frame.right, lateral)
    boat.position.y += -SEA_DROP + 0.35
    boat.rotation.y = yaw
    boat.scale.setScalar(2.4)
    boatGroup.add(boat)
  }
  group.add(boatGroup)

  const fadeLayers = [
    { when: 'coast', object: beachGroup, material: beachMaterial, key: 'opacity' },
    { when: 'coast', object: waterGroup, material: waterUniforms.uFade, key: 'value' },
    { when: 'coast', object: palmGroup, material: trunkMaterial, key: 'opacity' },
    { when: 'coast', object: palmGroup, material: frondMaterial, key: 'opacity' },
    { when: 'coast', object: shoreRocks, material: shoreRockMaterial, key: 'opacity' },
    { when: 'coast', object: boatGroup, material: hullMaterial, key: 'opacity' },
    { when: 'coast', object: boatGroup, material: sailMaterial, key: 'opacity' },
  ]
  // 灯塔的四个材质逐个登记：它们是四块独立网格，淡出要一起走
  lighthouse.traverse((object) => {
    if (object.isMesh) fadeLayers.push({ when: 'coast', object: lighthouse, material: object.material, key: 'opacity' })
  })

  group.visible = false
  group.userData = { waterMaterial, beachMaterial, fadeLayers }
  return group
}
