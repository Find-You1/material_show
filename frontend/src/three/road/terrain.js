import * as THREE from 'three'
import { PALETTE } from './config'

/**
 * 地面：一整片深灰的圆盘。
 *
 * 故意用不受光照的 Basic 材质 —— 如果用 Standard，半球光会把它抬成中灰，
 * 黑白对比立刻塌掉。颜色不能跟背景一样黑：那样整片地形会消失，
 * 路和树看起来像悬在虚空里；压在 0x2a 上下的深灰刚好托出地形轮廓。
 *
 * 也不画远山：雾已经把 300 米外全部吃黑，山只会变成压在画面上的大灰片。
 */
export function buildGround() {
  const geometry = new THREE.CircleGeometry(1600, 64)
  const material = new THREE.MeshBasicMaterial({ color: PALETTE.ground })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.rotation.x = -Math.PI / 2
  // 路面最低点约 -37m（起伏曲线的最低处），地面压到 -52m 才不会在下坡段穿出来
  mesh.position.y = -52
  mesh.userData.material = material
  return mesh
}
