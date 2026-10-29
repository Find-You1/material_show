import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

import { mulberry32 } from './config'
import { groundHeightAt } from './landscape'

/**
 * 雪谷里的陈设：雪丘、礁石、杉树剪影。
 *
 * 远山只负责画天际线，近处那 150m 的雪原如果没有一点东西，
 * 就会被读成「一片蓝色的湖」。这些物件都压在雪面附近，
 * 用 InstancedMesh 各一次 draw call，不抢极光的戏。
 */
export function buildSnowProps() {
  const group = new THREE.Group()
  const random = mulberry32(90210)

  // 直升机两个悬停点（±22, -8）周围要留空，否则深色杉树会把它吃掉
  const clearsHover = (x, z) => {
    const inCorridor = Math.abs(z + 8) < 46 && Math.abs(x) < 62
    return !inCorridor
  }

  // 小女孩的舞台：木屋（-30, -30）门前到表单左下角这条路上不能立礁石，
  // 否则她会从石头里穿过去
  const clearsStage = (x, z) => {
    const nearHome = Math.hypot(x + 30, z + 30) < 14
    const inLane = x > -29 && x < -8 && z > -26 && z < 16
    return !nearHome && !inLane
  }

  // ---------- 雪丘 ----------
  // 只保留远处几道被风吹起来的雪脊。
  // 近处这些压扁的球在平视下就是一串白饼，反而比光秃的雪面更假
  const driftGeometry = new THREE.SphereGeometry(1, 22, 12)
  driftGeometry.scale(1, 0.2, 1)
  const driftMaterial = new THREE.MeshStandardMaterial({
    color: 0xc7d8ec,
    roughness: 0.98,
    metalness: 0,
  })
  const drifts = new THREE.InstancedMesh(driftGeometry, driftMaterial, 18)
  const matrix = new THREE.Matrix4()
  const quaternion = new THREE.Quaternion()
  const position = new THREE.Vector3()
  const scale = new THREE.Vector3()

  let placed = 0
  let guard = 0
  while (placed < 18 && guard < 400) {
    guard += 1
    const angle = random() * Math.PI * 2
    const radius = 90 + random() * 190
    const x = Math.sin(angle) * radius
    const z = -Math.cos(angle) * radius
    if (!clearsHover(x, z)) continue

    const size = 14 + random() * 20
    // 雪包压进雪面里，只露出一道柔和的坡
    position.set(x, groundHeightAt(x, z) - size * 0.3, z)
    quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), random() * Math.PI)
    scale.set(size, size * (0.8 + random() * 0.7), size * (0.7 + random() * 0.6))
    matrix.compose(position, quaternion, scale)
    drifts.setMatrixAt(placed, matrix)
    placed += 1
  }
  drifts.instanceMatrix.needsUpdate = true
  drifts.frustumCulled = false
  group.add(drifts)

  // ---------- 礁石 ----------
  const rockGeometry = new THREE.DodecahedronGeometry(1, 0)
  const rockMaterial = new THREE.MeshStandardMaterial({
    color: 0x2b3a52,
    roughness: 0.88,
    metalness: 0.05,
    flatShading: true,
  })
  const rocks = new THREE.InstancedMesh(rockGeometry, rockMaterial, 22)
  let rockCount = 0
  let rockGuard = 0
  while (rockCount < 22 && rockGuard < 400) {
    rockGuard += 1
    const angle = random() * Math.PI * 2
    const radius = 34 + random() * 150
    const x = Math.sin(angle) * radius
    const z = -Math.cos(angle) * radius
    if (!clearsStage(x, z)) continue
    const size = 0.9 + random() * 2.8
    position.set(x, groundHeightAt(x, z) + size * 0.2, z)
    quaternion.setFromEuler(
      new THREE.Euler(random() * 0.6, random() * Math.PI, random() * 0.6),
    )
    scale.set(size, size * (0.6 + random() * 0.5), size)
    matrix.compose(position, quaternion, scale)
    rocks.setMatrixAt(rockCount, matrix)
    rockCount += 1
  }
  rocks.count = rockCount
  rocks.instanceMatrix.needsUpdate = true
  rocks.frustumCulled = false
  group.add(rocks)

  // ---------- 杉树剪影 ----------
  // 三层锥体拼成一棵杉：单锥在近处就是一个黑色三角形，太假
  const tiers = [0, 1, 2].map((i) => {
    const cone = new THREE.ConeGeometry(1 - i * 0.24, 1.6, 7)
    cone.translate(0, 0.8 + i * 0.9, 0)
    return cone
  })
  const treeGeometry = mergeGeometries(tiers)
  const treeMaterial = new THREE.MeshStandardMaterial({
    color: 0x1b2736,
    roughness: 0.92,
    metalness: 0,
    flatShading: true,
  })
  const trees = new THREE.InstancedMesh(treeGeometry, treeMaterial, 46)
  let treeCount = 0
  guard = 0
  while (treeCount < 46 && guard < 800) {
    guard += 1
    // 沿两侧铺，别挡住中央的卡片；离镜头至少 55m，近处才不会有巨大的黑三角
    const side = treeCount % 2 === 0 ? -1 : 1
    const x = side * (26 + random() * 150)
    const z = 20 - random() * 250
    if (!clearsHover(x, z)) continue
    if (Math.hypot(x, z) < 55) continue

    const size = 2.2 + random() * 2.2
    position.set(x, groundHeightAt(x, z) - 0.3, z)
    quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), random() * Math.PI)
    scale.set(size * (0.8 + random() * 0.3), size * (1 + random() * 0.25), size * 0.85)
    matrix.compose(position, quaternion, scale)
    trees.setMatrixAt(treeCount, matrix)
    treeCount += 1
  }
  trees.count = treeCount
  trees.instanceMatrix.needsUpdate = true
  trees.frustumCulled = false
  group.add(trees)

  return { group, drifts, rocks, trees }
}
