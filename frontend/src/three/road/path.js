import * as THREE from 'three'

export const UP = new THREE.Vector3(0, 1, 0)

// 基准半径越小，画面里能看到的弯越急；振幅决定弯的深浅。
// 这组数经过曲率采样定下来（全长约 2050m、约 9% 路段转弯半径 < 60m、
// 最紧 14m、无自交）：250 保证弯够急又不会把 7m 宽的路面折起来，
// 95 的 3 次谐波造大回头弯，22 的 5 次谐波在大弯之间补小 S。
const RADIUS = 250
const WAVE_LARGE = 95
const WAVE_SMALL = 22
const SAMPLES = 720

/**
 * 一条闭合的盘山公路。
 *
 * 参数化取值递增 = 车辆右转（圆心在行驶方向的右侧），所以无论相机跟到哪里，
 * 近处路面都留在左下、远处路面向画面右上弯过去。
 * 半径与高度各叠两层正弦：半径制造急弯与回头弯，高度制造上下起伏。
 */
export function createRoadCurve() {
  const points = []

  for (let i = 0; i < SAMPLES; i += 1) {
    const a = (i / SAMPLES) * Math.PI * 2
    const r = RADIUS + WAVE_LARGE * Math.sin(a * 3 + 0.5) + WAVE_SMALL * Math.sin(a * 5 + 1.9)
    // 高度：基频决定一次长爬坡 + 一次长下坡，2/5/9 次谐波负责「坡中带坡」。
    // 只说最大坡度会吃亏：整圈一个低频正弦在眼前 50 米里几乎看不出起伏。
    // 现在的组合让坡顶/坡谷平均每隔 114m 出现一次，实测最大坡度 17.5°。
    const y =
      28 * Math.sin(a + 0.6) +
      8 * Math.sin(a * 2 + 1.1) +
      4 * Math.sin(a * 5 + 0.3) +
      2.5 * Math.sin(a * 9 + 1.7)
    points.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r))
  }

  const curve = new THREE.CatmullRomCurve3(points, true, 'centripetal', 0.5)
  // 急弯处弧长查找要更密，否则画框和车会沿着折线跳
  curve.arcLengthDivisions = 1600
  curve.updateArcLengths()
  return curve
}

export function wrap01(u) {
  return ((u % 1) + 1) % 1
}

/**
 * 取某里程处的完整正交标架：点、切线、右向量。
 * 右向量 = tangent × up，与车头 +Z 一致。
 */
export function frameAt(curve, u, out = {}) {
  const t = wrap01(u)
  const point = curve.getPointAt(t)
  const tangent = curve.getTangentAt(t).normalize()
  const right = new THREE.Vector3().crossVectors(tangent, UP).normalize()

  out.u = t
  out.point = point
  out.tangent = tangent
  out.right = right
  return out
}
