import * as THREE from 'three'

import { mulberry32 } from './config'
import { groundHeightAt } from './landscape'
import { glowTexture } from './sky'

/**
 * 雪谷的第二层：近景冰棱、远景木屋、贴地低雾，以及小女孩家门口那间木屋。
 *
 * props.js 负责「雪是雪」—— 雪丘、礁石、杉树；
 * 这一层负责「画面有前后景」：冰棱在左右两侧压住取景框，
 * 远处几间木屋的暖窗给冷色雪谷一点人味，低雾把远山和雪原拉开。
 *
 * 冰棱原来是两簇，全挤在木屋前面；现在按距离散开铺到取景框两侧，
 * 只有这样近景才像「散落的冰笋」而不是「一堆碎玻璃」。
 */
export function buildDetails() {
  const group = new THREE.Group()
  const random = mulberry32(77123)

  // ---------- 前景冰棱 ----------
  // 六棱柱压扁再往外倒，读成被风塑出来的冰笋；
  // 顶部收细但不收成针尖，六个面的冰柱比完美圆锥更像天然冰块
  const shardGeometry = new THREE.CylinderGeometry(0.42, 1, 1, 6, 1)
  shardGeometry.translate(0, 0.5, 0)
  const shardMaterial = new THREE.MeshStandardMaterial({
    color: 0x9dc6ea,
    roughness: 0.24,
    metalness: 0.06,
    flatShading: true,
    emissive: 0x16344f,
    emissiveIntensity: 0.45,
  })
  const SHARDS = 18
  const shards = new THREE.InstancedMesh(shardGeometry, shardMaterial, SHARDS)
  const matrix = new THREE.Matrix4()
  const quaternion = new THREE.Quaternion()
  const leaning = new THREE.Quaternion()
  const position = new THREE.Vector3()
  const scale = new THREE.Vector3()

  // 木屋门前到表单左下角是女孩的舞台，这一片不能立冰棱，
  // 否则她从门里走出来会像穿过一片石林
  const clearsStage = (x, z) => !(x > -54 && x < 2 && z > -52 && z < 18)

  // 冰棱要「散落在雪原上」，不是「两边各一簇」。
  // 所以：左右侧随机（不再成对）、远近都铺、而且彼此之间至少隔开十几米 ——
  // 只按随机撒，seed 一凑巧就又挤成一堆（用户就截图指过这一点）
  const placedShards = []
  const farEnough = (x, z, min) =>
    placedShards.every((p) => Math.hypot(p.x - x, p.z - z) > min)

  for (let i = 0; i < SHARDS; i += 1) {
    let x = 0
    let z = 0
    let guard = 0
    do {
      const side = random() < 0.5 ? -1 : 1
      x = side * (25 + Math.pow(random(), 1.35) * 68)
      z = -12 - random() * 92
      guard += 1
    } while ((!clearsStage(x, z) || !farEnough(x, z, 13)) && guard < 60)
    placedShards.push({ x, z })

    const height = 4 + random() * 7
    const width = 1 + random() * 1.7

    position.set(x, groundHeightAt(x, z) - 0.7, z)
    quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), random() * Math.PI)
    // 冰棱整体往外侧倒：直立的锥子在雪里像路标，歪一点才像天然冰笋
    leaning.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.sign(x) * (0.1 + random() * 0.16))
    quaternion.multiply(leaning)
    scale.set(width, height, width * (0.7 + random() * 0.5))
    matrix.compose(position, quaternion, scale)
    shards.setMatrixAt(i, matrix)
  }
  shards.instanceMatrix.needsUpdate = true
  shards.frustumCulled = false
  group.add(shards)

  // ---------- 远处木屋 ----------
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: 0x2a2119,
    roughness: 0.92,
    metalness: 0,
  })
  const roofMaterial = new THREE.MeshStandardMaterial({
    color: 0x17120f,
    roughness: 0.95,
    metalness: 0,
  })
  const windowMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color().setRGB(2.3, 1.2, 0.52),
    toneMapped: false,
  })

  const cabins = new THREE.Group()
  const CABINS = [
    { x: -72, z: -122, scale: 1.15 },
    { x: 74, z: -108, scale: 0.95 },
    { x: -64, z: -88, scale: 0.8 },
  ]

  for (const spec of CABINS) {
    const cabin = new THREE.Group()
    const width = 6.4
    const depth = 8
    const height = 3.2

    const body = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), bodyMaterial)
    body.position.y = height / 2
    cabin.add(body)

    // 四坡屋顶：四棱锥转 45° 让边对齐屋身
    const roof = new THREE.Mesh(new THREE.ConeGeometry(5.4, 2.2, 4), roofMaterial)
    roof.rotation.y = Math.PI / 4
    roof.position.y = height + 1.1
    cabin.add(roof)

    for (const offset of [-1.55, 1.55]) {
      const windowMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 1.15), windowMaterial)
      windowMesh.position.set(offset, 1.75, depth / 2 + 0.03)
      cabin.add(windowMesh)
    }

    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture([
          [0, 'rgba(255,214,150,0.9)'],
          [0.35, 'rgba(255,186,110,0.38)'],
          [1, 'rgba(255,170,90,0)'],
        ]),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    )
    halo.scale.setScalar(5.5)
    halo.position.set(0, 1.9, depth / 2 + 0.4)
    cabin.add(halo)

    cabin.position.set(spec.x, groundHeightAt(spec.x, spec.z) - 0.35, spec.z)
    cabin.rotation.y = Math.atan2(-spec.x, 46 - spec.z)
    cabin.scale.setScalar(spec.scale)
    cabins.add(cabin)
  }
  group.add(cabins)

  // ---------- 小女孩家的木屋 ----------
  // 门必须比她高：她走出来时头顶擦着门楣、肩擦着门框，
  // 就是「人穿墙而出」。所以屋子按门定尺寸 —— 门洞 7.1 米高，
  // 她的身高 5.85 米，留出一整头多的余量
  const HOME = { x: -30, z: -30, scale: 2.85 }
  const homeGroup = new THREE.Group()
  const width = 7.2
  const depth = 8.4
  const height = 5.0
  // 门洞按「她的身高 × 1.2」定：她 5.85 米高，门洞 7.1 米，
  // 从门里走出来才不荒谬，也不会让人头穿出门楣
  const doorW = 1.62
  const doorH = 2.5
  // 门开在屋子偏右的一侧：她出来就往画面中央走，不用先横穿整间屋子
  const doorX = 1.05
  const halfW = width / 2
  const halfD = depth / 2

  // 屋身必须是空壳：正面墙留出真正的门洞，里面的暖光才能从她背后透出来。
  // 用一整块 Box 当屋身的话，门一开后面只是另一块黑墙 —— 读不出「里面有火」。
  // 内壁用 Basic 近黑：这屋子没有阴影也没有室内灯，
  // 一旦按 Standard 受光，门洞里就会是一块惨白的板子，像贴了张纸
  const shellMaterial = new THREE.MeshBasicMaterial({
    color: 0x150d08,
    side: THREE.DoubleSide,
    toneMapped: false,
  })
  const wall = (w, h) => new THREE.Mesh(new THREE.PlaneGeometry(w, h), shellMaterial)

  const backWall = wall(width, height)
  backWall.position.set(0, height / 2, -halfD)
  homeGroup.add(backWall)

  for (const side of [-1, 1]) {
    const sideWall = wall(depth, height)
    sideWall.rotation.y = (side * Math.PI) / 2
    sideWall.position.set(side * halfW, height / 2, 0)
    homeGroup.add(sideWall)
  }

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(width, depth),
    new THREE.MeshBasicMaterial({ color: 0x120b07, toneMapped: false }),
  )
  floor.rotation.x = -Math.PI / 2
  floor.position.y = 0.05
  homeGroup.add(floor)

  // 正面墙：左、右、门楣三块，中间留 1.9 × 3 的门洞
  const doorLeft = doorX - doorW / 2
  const doorRight = doorX + doorW / 2
  const frontMaterial = new THREE.MeshStandardMaterial({
    color: 0x2a2119,
    roughness: 0.92,
    metalness: 0,
  })
  const slab = (w, h, cx, cy) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.16), frontMaterial)
    mesh.position.set(cx, cy, halfD)
    homeGroup.add(mesh)
  }
  slab(doorLeft + halfW, height, (-halfW + doorLeft) / 2, height / 2)
  slab(halfW - doorRight, height, (doorRight + halfW) / 2, height / 2)
  slab(doorW, height - doorH, doorX, (height + doorH) / 2)

  // 屋顶盖满屋身还挑出一点檐（内切半径 5.4/√2 ≈ 3.8，比 3.6 的半宽大），
  // 再大就变成一顶压在画面前景的黑帐篷
  const roof = new THREE.Mesh(new THREE.ConeGeometry(5.4, 2.3, 4), roofMaterial)
  roof.rotation.y = Math.PI / 4
  roof.position.y = height + 1.15
  homeGroup.add(roof)

  // 门洞里那点火光：一小片不抢眼的暖橙，门开才亮。
  // 它只是「灯的影子」，真正把门洞点亮的是下面那盏 PointLight
  const doorwayGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(doorW * 1.6, doorH * 1.1),
    new THREE.MeshBasicMaterial({
      map: glowTexture([
        [0, 'rgba(255,214,150,0.95)'],
        [0.42, 'rgba(255,170,96,0.5)'],
        [1, 'rgba(255,150,70,0)'],
      ]),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
      opacity: 0,
    }),
  )
  doorwayGlow.position.set(doorX, doorH * 0.62, -halfD + 2.4)
  homeGroup.add(doorwayGlow)

  // 屋里那盏灯的真实光照：暖橙、只在门口附近衰减。
  // 有了它，雪面、门板、女孩的背影都会被染上一层橙，门才像真的开着
  const doorLight = new THREE.PointLight(0xffa860, 0, 30, 2)
  doorLight.position.set(doorX, 1.9, halfD - 0.4)
  homeGroup.add(doorLight)

  const doorMaterial = new THREE.MeshStandardMaterial({
    color: 0x5b3a26,
    roughness: 0.88,
    metalness: 0,
  })
  const hinge = new THREE.Group()
  hinge.position.set(doorX - doorW / 2, 0, halfD + 0.16)
  const panel = new THREE.Mesh(new THREE.BoxGeometry(doorW, doorH, 0.14), doorMaterial)
  panel.position.set(doorW / 2, doorH / 2, 0)
  hinge.add(panel)

  const handle = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0xd8c39a, roughness: 0.5, metalness: 0.3 }),
  )
  handle.position.set(doorW - 0.24, doorH * 0.48, 0.1)
  hinge.add(handle)
  homeGroup.add(hinge)

  // 门旁边一扇窗：证明这是有人住的屋子，不是布景板。
  // 比门洞小一圈、用更低一档的暖色 —— 远景那盏 2.3 的白窗放大了会直接爆成一个白方块
  const homeWindow = new THREE.Mesh(
    new THREE.PlaneGeometry(0.86, 1.04),
    new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(1.45, 0.78, 0.34), toneMapped: false }),
  )
  homeWindow.position.set(-2.1, 2.35, halfD + 0.12)
  homeGroup.add(homeWindow)

  const homeHalo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture([
        [0, 'rgba(255,214,150,0.85)'],
        [0.4, 'rgba(255,186,110,0.32)'],
        [1, 'rgba(255,170,90,0)'],
      ]),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }),
  )
  homeHalo.scale.setScalar(4.2)
  homeHalo.position.set(-2.1, 2.4, halfD + 0.45)
  homeGroup.add(homeHalo)

  homeGroup.position.set(HOME.x, groundHeightAt(HOME.x, HOME.z) - 0.3, HOME.z)
  homeGroup.rotation.y = Math.atan2(-HOME.x, 46 - HOME.z)
  homeGroup.scale.setScalar(HOME.scale)
  homeGroup.updateWorldMatrix(true, false)
  group.add(homeGroup)

  // 门槛内外两点：女孩从里面走出来，起点缩在门洞深处（正面墙挡住她）
  const doorInside = homeGroup.localToWorld(new THREE.Vector3(doorX, 0, halfD - 0.95))
  const doorOutside = homeGroup.localToWorld(new THREE.Vector3(doorX, 0, halfD + 1.4))
  // 门口在雪地上洒出的暖光：加色平面贴着雪面，门开得越大越亮
  const doorPool = new THREE.Mesh(
    new THREE.PlaneGeometry(8.5, 6),
    new THREE.MeshBasicMaterial({
      map: glowTexture([
        [0, 'rgba(255,186,110,0.6)'],
        [0.45, 'rgba(255,162,84,0.2)'],
        [1, 'rgba(255,150,70,0)'],
      ]),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
      opacity: 0,
    }),
  )
  doorPool.rotation.x = -Math.PI / 2
  doorPool.position.set(doorOutside.x, groundHeightAt(doorOutside.x, doorOutside.z) + 0.07, doorOutside.z)
  doorPool.rotation.z = homeGroup.rotation.y
  group.add(doorPool)

  let doorK = 0
  function setDoor(value) {
    doorK = Math.min(1, Math.max(0, value))
    // 往屋里开：门板甩向室内、贴着内侧墙，门洞才不会被门板从机位挡住，
    // 里面的暖光也才能顺着门洞漏出来
    hinge.rotation.y = 1.85 * doorK
  }

  const home = { group: homeGroup, hinge, doorInside, doorOutside, setDoor }

  // ---------- 贴地低雾 ----------
  // 几片被拉长的软光斑，慢慢横向漂。它们比任何雪花都更能读出「距离」
  const fogTexture = glowTexture([
    [0, 'rgba(206,228,250,0.5)'],
    [0.34, 'rgba(198,222,248,0.3)'],
    [0.72, 'rgba(190,214,242,0.09)'],
    [1, 'rgba(190,214,242,0)'],
  ])
  const FOGS = [
    { x: -58, z: -74, w: 200, h: 36, y: 6, phase: 0.3, opacity: 0.12 },
    { x: 52, z: -96, w: 230, h: 42, y: 8, phase: 2.1, opacity: 0.1 },
    { x: -14, z: -138, w: 280, h: 48, y: 9, phase: 4.0, opacity: 0.08 },
    { x: -88, z: -46, w: 150, h: 28, y: 4, phase: 5.2, opacity: 0.07 },
  ]
  const fogs = []
  for (const spec of FOGS) {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: fogTexture,
        transparent: true,
        opacity: spec.opacity,
        depthWrite: false,
        toneMapped: false,
      }),
    )
    sprite.scale.set(spec.w, spec.h, 1)
    sprite.position.set(spec.x, groundHeightAt(spec.x, spec.z) + spec.y, spec.z)
    sprite.userData = spec
    fogs.push(sprite)
    group.add(sprite)
  }

  function update(time) {
    // 极慢的横向漂移 + 呼吸式浓淡：频率都在 0.02~0.1Hz，画面不会闪
    for (const sprite of fogs) {
      const spec = sprite.userData
      sprite.position.x = spec.x + Math.sin(time * 0.07 + spec.phase) * 7
      sprite.material.opacity = spec.opacity * (0.86 + Math.sin(time * 0.13 + spec.phase) * 0.14)
    }

    // 门里的火光是活的：门开了才透出来，亮度随呼吸慢慢起伏
    const breath = 0.82 + Math.sin(time * 1.15) * 0.18
    doorwayGlow.material.opacity = doorK * breath
    doorPool.material.opacity = doorK * 0.9 * breath
    // 灯本身也跟着门开：门缝只有一条时，屋里就是一条暗橙
    doorLight.intensity = doorK * 42 * breath
  }

  return { group, update, shards, cabins, fogs, home }
}
