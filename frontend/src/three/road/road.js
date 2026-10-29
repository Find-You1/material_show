import * as THREE from 'three'
import { PALETTE, ROAD } from './config'
import { frameAt } from './path'

const FORWARD = new THREE.Vector3(0, 0, 1)

/**
 * 沿曲线铺一条带状几何：lateralA / lateralB 是左右偏移（右向量为正），
 * yOffset 抬高整条带。用 DoubleSide，省掉绕序烦恼。
 */
function buildStrip(curve, lateralA, lateralB, yOffset, segments, material) {
  const positions = []
  const uvs = []
  const indices = []

  for (let i = 0; i <= segments; i += 1) {
    const frame = frameAt(curve, i / segments)
    const a = frame.point.clone().addScaledVector(frame.right, lateralA)
    const b = frame.point.clone().addScaledVector(frame.right, lateralB)
    a.y += yOffset
    b.y += yOffset

    positions.push(a.x, a.y, a.z, b.x, b.y, b.z)
    const v = i / segments
    uvs.push(0, v, 1, v)

    if (i < segments) {
      const k = i * 2
      indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2)
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()

  // 绕序可能让法线朝下：那样路面只能吃到环境光，白色会变成中灰。
  // 这些带子都是水平或接近水平的，统一把法线翻到朝上。
  const normal = geometry.getAttribute('normal')
  let ySum = 0
  for (let i = 0; i < normal.count; i += 1) ySum += normal.getY(i)
  if (ySum < 0) {
    for (let i = 0; i < normal.count; i += 1) normal.setXYZ(i, -normal.getX(i), -normal.getY(i), -normal.getZ(i))
    normal.needsUpdate = true
  }

  material.side = THREE.DoubleSide
  return new THREE.Mesh(geometry, material)
}

/** 把闭合曲线整体侧移、抬高，得到护栏中心线 */
function offsetCurve(curve, lateral, height, segments = 400) {
  const points = []
  for (let i = 0; i < segments; i += 1) {
    const frame = frameAt(curve, i / segments)
    const point = frame.point.clone().addScaledVector(frame.right, lateral)
    point.y += height
    points.push(point)
  }
  return new THREE.CatmullRomCurve3(points, true, 'centripetal', 0.5)
}

/**
 * 护栏横杆用圆管而不是薄带：0.09m 的带子在侧视时接近正面平行，
 * 会被抗锯齿切成一段段虚线；圆管有实体截面，任何角度都是连续的一条。
 */
function buildRail(curve, lateral, height, material) {
  const geometry = new THREE.TubeGeometry(offsetCurve(curve, lateral, height), 700, 0.045, 4, true)
  return new THREE.Mesh(geometry, material)
}

/** 白色路面 + 黑色边石 + 两侧护栏横杆 */
export function buildRoad(curve) {
  const group = new THREE.Group()

  const roadMat = new THREE.MeshStandardMaterial({
    color: PALETTE.road,
    // 哑光：避免掠射角的高光把远处路面刷成一片白、近处又发灰
    roughness: 0.94,
    metalness: 0,
    // 自带一点自发光：夜里这层路面要读成「白」，不能靠外部灯光打亮。
    // 0.92 配合 Neutral 色调映射刚好落在接近 255 的白，而不会把整条路送进泛光阈值
    emissive: 0xffffff,
    emissiveIntensity: 0.92,
  })
  const kerbMat = new THREE.MeshStandardMaterial({
    color: PALETTE.kerb,
    roughness: 0.7,
    metalness: 0.1,
  })
  const railMat = new THREE.MeshStandardMaterial({
    color: PALETTE.rail,
    roughness: 0.4,
    metalness: 0.35,
  })

  const segments = 900
  group.add(buildStrip(curve, ROAD.half, -ROAD.half, 0, segments, roadMat))
  group.add(buildStrip(curve, ROAD.half + ROAD.sideLine, ROAD.half, 0.006, segments, kerbMat))
  group.add(buildStrip(curve, -ROAD.half, -ROAD.half - ROAD.sideLine, 0.006, segments, kerbMat))

  // 路肩：从边石往外铺 30 米的暗色平面，让护栏立柱和画框有立足处。
  // 不做立面，所以只能用不受光照的 Basic 材质 —— 否则会亮成一片灰。
  // 颜色跟着主题走：雪地时这一圈要变成雪原，森林时恢复近黑。
  const vergeMat = new THREE.MeshBasicMaterial({ color: PALETTE.verge })
  const vergeRight = buildStrip(curve, ROAD.half + ROAD.sideLine, 30, -0.02, segments, vergeMat)
  const vergeLeft = buildStrip(curve, -30, -ROAD.half - ROAD.sideLine, -0.02, segments, vergeMat)
  group.add(vergeRight, vergeLeft)

  const railOffset = ROAD.postLateral + 0.05
  group.add(buildRail(curve, railOffset, 1.02, railMat))
  group.add(buildRail(curve, -railOffset, 1.02, railMat))

  group.userData.roadMaterial = roadMat
  group.userData.vergeMaterial = vergeMat
  // 海岸主题要用地形自己的斜坡替换这两条平面路肩：
  // 30 米宽的水平路肩在 3.4 米的视高下会把海完全挡死（见 coast.js）
  group.userData.verges = [vergeRight, vergeLeft]
  return group
}

/** 护栏立柱：白色细杆，跟着坡度站直 */
export function buildPosts(curve, length) {
  const perSide = Math.max(2, Math.round(length / ROAD.postGap))
  const count = perSide * 2
  const geometry = new THREE.BoxGeometry(0.1, 1.0, 0.1)
  const material = new THREE.MeshStandardMaterial({
    color: PALETTE.post,
    roughness: 0.45,
    metalness: 0.3,
  })
  const mesh = new THREE.InstancedMesh(geometry, material, count)
  const matrix = new THREE.Matrix4()
  const quaternion = new THREE.Quaternion()
  const scale = new THREE.Vector3(1, 1, 1)

  let index = 0
  for (let side of [1, -1]) {
    for (let i = 0; i < perSide; i += 1) {
      const frame = frameAt(curve, i / perSide)
      const position = frame.point
        .clone()
        .addScaledVector(frame.right, side * ROAD.postLateral)
      position.y += 0.5
      quaternion.setFromUnitVectors(FORWARD, frame.tangent)
      matrix.compose(position, quaternion, scale)
      mesh.setMatrixAt(index, matrix)
      index += 1
    }
  }
  mesh.instanceMatrix.needsUpdate = true

  return mesh
}
