﻿﻿﻿﻿﻿﻿﻿// 场景的唯一色源与尺寸参数。
// 主色是黑白：白色哑光材质承载道路与画框，黑色收掉车身和远景，照片本身保留彩色。

export const PALETTE = {
  background: 0x08080a,
  fog: 0x08080a,
  road: 0xffffff,
  kerb: 0x0f1012,
  frame: 0xf2f2f4,
  post: 0xc9cbd1,
  rail: 0xe6e7ea,
  carBody: 0x0b0b0d,
  carGlass: 0x050507,
  carTrim: 0x191a1e,
  rim: 0xc6c9cf,
  lamp: 0xffffff,
  // 树必须比地面亮一档，否则整片黑剪影会直接糊进夜空。
  // 注意 Neutral 色调映射会把暗部狠压（0x4a5563 出来只剩 ~0x33），
  // 所以这里的数值要按「渲染后」反推，不能直接照抄想要的灰阶。
  tree: 0x6d7d94,
  // 碎石压得太黑就完全看不见，这一点点灰度刚好在路肩上留个边
  rock: 0x54565f,
  dash: 0x9a9da4,
  // 路面两侧 30m 的路肩带是画面里占比最大的「地面」。
  // 压成近黑时整片地形消失，路和树都像悬在虚空里；
  // 这两个值实测渲染后约 #3a3a40，是「能看清但不抢白路」的深灰。
  verge: 0x4a4c55,
  ground: 0x45474f,
  skyTop: 0x040405,
  skyMid: 0x0a0b0d,
  skyHorizon: 0x26282d,
  skyBottom: 0x050506,
}

// 六套配色：山路 / 雪地 / 森林 / 黎明 / 暮色 / 深夜。
// 切主题时只换颜色，不重建几何 —— 这样过渡可以整段插值，车、雾、天空、地面、树一起淡变。
// 每套只写与山路不同的键，其余继承 PALETTE。
export const THEMES = [
  {
    id: 'mountain',
    label: 'Mountain',
    patch: {},
    tone: { treeGlow: 0.7 },
    // 山地：杉树 + 大块岩石，前景有体量；夜里挂一枚清冷的月亮
    extras: { forestTrees: false, boulders: true, moon: true },
  },
  {
    id: 'snow',
    label: 'Snow',
    // 雪夜不是「全都白」：天空保持夜里该有的暗，雪只铺在地面和路肩上。
    // 这样白路、白树、白车才有对比，左上角的白字也还读得清。
    patch: {
      background: 0x0d1218,
      fog: 0x0d1218,
      ground: 0x9fabb9,
      verge: 0xbcc7d3,
      tree: 0xeaf0f7,
      rock: 0x9aa7b6,
      // 雪地里不能再用黑车：白路 + 白雪之间，深青蓝的车身才看得出轮廓
      carBody: 0x2c3f52,
      skyTop: 0x06080b,
      skyMid: 0x0b1117,
      skyHorizon: 0x2b3644,
      skyBottom: 0x151b23,
    },
    tone: { treeGlow: 0.5 },
    // 雪原：落雪 + 雪里的岩石 + 雪光照亮的月
    extras: { forestTrees: false, snowfall: true, boulders: true, moon: true },
  },
  {
    id: 'forest',
    label: 'Forest',
    patch: {
      background: 0x070b08,
      fog: 0x070b08,
      // 林地不能跟夜色一样黑：树根、碎石要压在一层能看出明暗的地面上，
      // 否则整片树像从黑幕里长出来，底部全糊掉
      ground: 0x2c3a2e,
      verge: 0x344437,
      road: 0xf7f5ef,
      // 林线要能看出是「树」：比林地亮一档的墨绿，不是纯黑剪影
      tree: 0x7f9c86,
      rock: 0x3b4a3e,
      // 每个场景换一种车漆，车才会跟着地图「换装」
      carBody: 0x1f4a2c,
      skyTop: 0x050806,
      skyMid: 0x090e0a,
      skyHorizon: 0x223028,
      skyBottom: 0x060907,
    },
    // 树下最暗，单靠环境光会全黑；给森林多一点自发光把树干托起来
    tone: { treeGlow: 0.95 },
    // 森林：密林层 + 灌木地被 + 林隙外的月光
    extras: { forestTrees: true, bushes: true, moon: true },
  },
  {
    id: 'dawn',
    label: 'Dawn',
    // 黎明：暖橙地平线，天顶仍然是夜；地面只透出一点暖灰，保证黑白路面对比
    patch: {
      background: 0x120d0b,
      fog: 0x120d0b,
      ground: 0x4a3a2c,
      verge: 0x564335,
      road: 0xfff8ef,
      tree: 0x9a7757,
      rock: 0x5c4936,
      carBody: 0xa8541f,
      skyTop: 0x0a0709,
      skyMid: 0x1c1213,
      skyHorizon: 0x8c5b3f,
      skyBottom: 0x150e0c,
    },
    tone: { treeGlow: 0.75 },
    // 黎明：地平线上的暖阳 + 稀疏灌木
    extras: { forestTrees: false, bushes: true, sun: true },
  },
  {
    id: 'dusk',
    label: 'Dusk',
    patch: {
      background: 0x0b0812,
      fog: 0x0b0812,
      ground: 0x3a3045,
      verge: 0x463a52,
      road: 0xf6f2fb,
      tree: 0x816a95,
      rock: 0x453a54,
      carBody: 0x4b2470,
      skyTop: 0x06050b,
      skyMid: 0x150e1e,
      skyHorizon: 0x6d3a5b,
      skyBottom: 0x0c0812,
    },
    tone: { treeGlow: 0.75 },
    // 暮色：紫色落日 + 灌木
    extras: { forestTrees: false, bushes: true, sun: true },
  },
  {
    id: 'midnight',
    label: 'Midnight',
    patch: {
      background: 0x04060c,
      fog: 0x04060c,
      ground: 0x28303f,
      verge: 0x323c4e,
      road: 0xf4f7fc,
      tree: 0x6a88ab,
      rock: 0x354056,
      carBody: 0x16324f,
      skyTop: 0x02040a,
      skyMid: 0x061020,
      skyHorizon: 0x1e3550,
      skyBottom: 0x03060c,
    },
    tone: { treeGlow: 0.75 },
    // 深夜：满天星 + 月亮
    extras: { forestTrees: false, stars: true, moon: true },
  },
  {
    id: 'coast',
    label: 'Coast',
    // 海岸：近处沙滩、外侧低一截的海面。海是唯一需要动画的地面（见 coast.js），
    // 只在这个主题里显示，其余主题整组隐藏、不参与渲染
    patch: {
      background: 0x08161d,
      fog: 0x08161d,
      // 沙滩要亮，才不会又变成一块黑地
      ground: 0xc8b492,
      verge: 0xdac6a2,
      road: 0xf2f2f0,
      tree: 0x5c7a63,
      rock: 0xa89575,
      carBody: 0x0f6b78,
      skyTop: 0x040b12,
      skyMid: 0x0a2533,
      skyHorizon: 0x3f7f93,
      skyBottom: 0x0a1a22,
    },
    tone: { treeGlow: 0.62 },
    // 海岸：沙坡 + 海 + 棕榈，海平线上再压一轮低低的落日
    extras: { forestTrees: false, coast: true, flora: 'none', palms: true, sun: true },
  },
  {
    id: 'desert',
    label: 'Desert',
    patch: {
      background: 0x140f0b,
      fog: 0x140f0b,
      ground: 0xa07c52,
      verge: 0xb08a5b,
      road: 0xfff6e6,
      tree: 0x8a7350,
      rock: 0x7a6242,
      carBody: 0x8a2f1d,
      skyTop: 0x0b0806,
      skyMid: 0x2a1a10,
      skyHorizon: 0xa9713c,
      skyBottom: 0x1a120b,
    },
    tone: { treeGlow: 0.62 },
    // 沙漠里不该有杉树：换成仙人掌 + 干枯灌木丛 + 大块砂岩，
    // 天上一轮晒得发白的太阳
    extras: { forestTrees: false, flora: 'cacti', bushes: true, boulders: true, sun: true },
  },
]

/** 把主题 patch 合进基准色板，得到一套完整配色 */
export function themePalette(index) {
  const theme = THEMES[((index % THEMES.length) + THEMES.length) % THEMES.length]
  return { ...PALETTE, ...theme.patch }
}

/** 非颜色参数（自发光强度这类），同样按主题给出目标值 */
export function themeProfile(index) {
  const theme = THEMES[((index % THEMES.length) + THEMES.length) % THEMES.length]
  return { treeGlow: 0.7, ...theme.tone }
}

export const CAMERA = {
  fov: 36,
  near: 0.1,
  far: 1400,
  // 相机在车后、车行方向的右侧 —— 近处路面落在左下，远处收束到右上
  backDistance: 13.5,
  lateral: 1.6,
  height: 3.4,
  lookAhead: 30,
  lookLateral: -2.4,
  lookHeight: 0.2,
  // 点击画框后停在它前方多远，画框大约占画面高度的六成
  focusDistance: 6,
  flyDuration: 0.95,
  returnDuration: 0.8,
}

export const ROAD = {
  width: 7,
  half: 3.5,
  sideLine: 0.16,
  postGap: 11,
  postLateral: 5.2,
}

export const BOARD = {
  width: 2.2,
  height: 2.8,
  lateral: 6.6,
  centerHeight: 2.3,
  // 沿路每隔多少米一组（只在右侧）
  spacing: 13,
}

export const MOTION = {
  speed: 16, // 米/秒：再快画框一掠而过，看不清也点不中
  hoverScale: 1.06,
  // 拖拽环视的幅度上限（弧度）
  orbitYaw: 0.9,
  orbitPitch: 0.34,
  // 没有操作时每隔多少秒自动换下一套场景。闪动的真凶是后处理链
  // （已移除），0.9s 的颜色插值本身不会闪；用户一碰画面就重新计时
  themeInterval: 20,
}
