/**
 * 登录 / 注册片场：雪谷 + 极光 + 直升机。
 *
 * 这一页是「电影开场」：镜头从雪谷上空一路推进到表单前，
 * 一架直升机从远处飞来，绕着表单悬停；登录与注册从相对的两侧进入，
 * 切换时它先拔高飞出画面，再从另一侧绕回来。
 */

export const CAMERA = { fov: 40, near: 0.1, far: 2400 }

/** 开场推进：从雪谷上空推进到表单高度 */
export const INTRO = {
  duration: 5.2,
  from: { x: 0, y: 58, z: 150, lookY: 16, lookZ: -150 },
  // 收尾几乎水平：山脊落在画面上三分之一，天空那一带才装得下极光；
  // 继续俯视 8° 的话，视野下方 85% 全是空雪地，没有「恢宏」可言
  to: { x: 0, y: 8.6, z: 46, lookY: 9.4, lookZ: -140 },
}

export const FLIGHT = {
  // 开场：等镜头落下来一点再飞进来
  enterDelay: 0.9,
  enter: 2.9,
  // 切页：先飞出画面，再从另一侧飞入
  leave: 0.62,
  switchIn: 1.7,
  // 悬停面：比原来更靠近镜头一点，机体够大但不会糊在表单上。
  // 具体的 x / y 由屏幕坐标反投影算（见 AuthScene#layout）：
  // 锚点是表单卡右外沿的中段，整架飞机都在卡片外侧
  hoverZ: -2,
  scale: 0.86,
  // 停靠偏移（视口比例）：不再往卡片里压。之前 outward 只有 0.014，
  // 机头探进卡片里把表单糊掉一块；现在整架飞机停在卡片右外侧，
  // 机体落在亮雪上，既不遮表单也看得清
  anchor: { outward: 0.075, down: 0.36 },
  // 起飞点：在取景框外，所以「出现」这一下不会看到瞬移。
  // 退场点由 AuthScene 按飞行方向现算（见 setMode）
  start: { x: 104, y: 36, z: 28 },
}

/**
 * 小女孩的分镜时间轴（单位：秒，从片场挂载开始算）。
 *
 * 镜头落定是 5.2s，直升机 3.8s 就在表单边悬停好了；
 * 所以剧情等到 6.2s 才起 —— 开场那几秒不该有第二个演员抢戏。
 * 之后就是：开门 → 探身出来 → 走到表单左下 → 笑 → 扬雪 → 转一圈 → 挥手。
 */
export const STORY = {
  start: 6.2,
  door: 1.0, // 门开
  step: 1.3, // 从门里迈出来（门还开着）
  walk: 7.4, // 捧着雪走到表单边
  smile: 1.6, // 站定，仰头笑
  throw: 1.0, // 双手把雪扬出去
  spin: 1.6, // 转一圈
  wave: 5.0, // 站定挥手
}

/** 两种模式的极光色：登录青绿、注册紫红 */
export const MOODS = {
  login: {
    fog: 0x081522,
    skyTop: 0x01030a,
    skyMid: 0x06121f,
    skyHorizon: 0x0b2233,
    auroraA: 0x2ee7b6,
    auroraB: 0x2f6dff,
    auroraC: 0x9ffbe4,
    auroraIntensity: 1,
    // 雪地乘色：极光的青绿会反到雪面上，纯白会显得像塑料
    snowTint: 0xcfe6f4,
    hemi: 0x9fd8ff,
    key: 0xd3e6ff,
  },
  register: {
    fog: 0x0c0a1b,
    skyTop: 0x02010a,
    skyMid: 0x0b0820,
    skyHorizon: 0x1b1038,
    auroraA: 0xb883ff,
    auroraB: 0xff5fa8,
    auroraC: 0xffd2ec,
    auroraIntensity: 1.05,
    snowTint: 0xe4d6f6,
    hemi: 0xcab8ff,
    key: 0xe8dcff,
  },
}

export const GROUND_Y = -0.6

/** 缓动 */
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3)
export const easeInCubic = (t) => t * t * t
export const easeInOutCubic = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2

export function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
