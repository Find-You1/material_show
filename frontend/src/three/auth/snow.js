import * as THREE from 'three'

import { mulberry32 } from './config'
import { glowTexture } from './sky'

/**
 * 落雪：一盒只出现在镜头前方的雪点。
 *
 * 盒子跟着相机走，所以车/人永远在雪里；每片雪独立速度与横向摆动，
 * 落到盒底再回到顶部。所有雪点都在相机前方 8~150m，
 * 不会出现「贴着镜头的一片巨大白斑」。
 */
export function buildSnowfall(count = 1500) {
  const positions = new Float32Array(count * 3)
  const seeds = new Float32Array(count)
  const random = mulberry32(7741)

  for (let i = 0; i < count; i += 1) {
    positions[i * 3] = (random() - 0.5) * 150
    positions[i * 3 + 1] = random() * 46
    positions[i * 3 + 2] = -10 - random() * 145
    seeds[i] = random()
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  const base = positions.slice()

  const material = new THREE.PointsMaterial({
    color: 0xeaf3ff,
    // 不带贴图的 PointsMaterial 会画成方块：近处那几片就是糊在镜头上的白纸屑
    map: glowTexture([
      [0, 'rgba(255,255,255,0.95)'],
      [0.45, 'rgba(255,255,255,0.55)'],
      [1, 'rgba(255,255,255,0)'],
    ]),
    size: 0.32,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    fog: true,
    toneMapped: false,
  })

  const points = new THREE.Points(geometry, material)
  points.frustumCulled = false

  return {
    points,
    material,
    update(time) {
      const array = geometry.attributes.position.array
      for (let i = 0; i < count; i += 1) {
        const seed = seeds[i]
        // 每片雪速度不同；落出 46m 后回到顶部
        const fall = (time * (1.4 + seed * 2.2)) % 46
        const drift = base[i * 3] + Math.sin(time * 0.55 + seed * 31) * 1.8 + time * 0.35
        // 横向漂移会一直累积，取模回 ±75，否则几分钟后整片雪都飘出取景框
        array[i * 3] = ((((drift + 75) % 150) + 150) % 150) - 75
        array[i * 3 + 1] = ((((base[i * 3 + 1] - fall) % 46) + 46) % 46) - 4
        array[i * 3 + 2] = base[i * 3 + 2]
      }
      geometry.attributes.position.needsUpdate = true
    },
  }
}
