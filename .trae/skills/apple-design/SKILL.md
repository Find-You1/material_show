---
name: apple-design
description: 本项目 Apple 官网式设计规范（浅色内容段 + 电影感黑场首屏，全英文文案）。新增页面、改样式、调配色、做动效或 hero 视觉时使用，避免混入旧版暗色琥珀金或背景 3D 走廊。
---

# Apple 风设计规范（本项目）

## 一句话原则

黑场开场、白场阅读：首屏是满幅剧照 + 白字的电影感黑场，内容页回到纯白大留白。
单一苹果蓝、胶囊按钮、极淡阴影；动效只做「缓慢、克制、有物理感」的位移与视差。
全站界面文案用英文（品牌名 Lumen），句子式大小写，不用感叹号。

**不做**：背景 3D 图墙、彩色光晕、渐变文字、图标堆砌、深色玻璃叠深色页面、
黑场上再加半透明黑卡片（边界只靠发丝白边交代）。

## 电影感章节（dark / light 交替）

Apple 产品页的叙事节奏：黑场 → 白场 → 黑场收尾。首页是标准示范：

0. **首屏是 Three.js 的黑白山路片场**（`frontend/src/components/home/RoadScene.vue` + `frontend/src/three/road/`）：
   用户一打开就看见一条夜间山路，白色路面从画面左下伸到右上，黑色跑车一路向前，照片装在白色画框里沿路铺开。
   - 代码必须分模块：`config`（色板/尺寸）、`path`（闭合曲线与标架）、`road`（路面/边石/路肩/护栏）、
     `terrain`（地面）、`sky`（渐变天空）、`car`（程序化跑车）、`boards`（照片画框）、
     `MonochromeRoad`（渲染器、相机、拾取、转场）。不要在 `.vue` 里堆场景代码。
   - 白材质靠 `emissive` 自发光读成白（`MeshStandardMaterial` + `emissiveIntensity ≈ 0.92`），
     不要靠把灯打亮 —— 灯一高，车顶和画框背板就反光成灰片。色调映射用 `NeutralToneMapping`
     （ACES 会把拉满的自发光压成浅灰），曝光 1.12。
   - 地面与路肩用 `MeshBasicMaterial`（不受光）：Standard 会被半球光抬成中灰，黑白对比立刻塌掉。
   - **路必须是盘山弯道，不能接近圆环**：闭合 `CatmullRomCurve3`，半径 250 + 95·sin(3a) + 22·sin(5a)，
     720 采样、`arcLengthDivisions = 1600`。实测全长 ~2050m、最小曲率半径 14m、9% 路段 <60m、无自交；
     再收紧就会让 7m 宽的路面自我折叠。
   - **路要上下坡**：高度 `28·sin(a+0.6) + 8·sin(2a+1.1) + 4·sin(5a+0.3) + 2.5·sin(9a+1.7)`
     （±37m、最大坡度 17.5°、坡顶/坡谷平均每 114m 一次）。基频负责一次长爬坡 + 一次长下坡，
     2/5/9 次谐波负责「坡中带坡」；只用一个低频正弦时，眼前 50m 内几乎看不出起伏。
     再陡车身会长仰头、远景被坡挡死。`terrain.js` 的地面必须压到 -52m，否则下坡段会从地面下面穿出来。
   - **两侧不能只有护栏**：`props.js` 用 `InstancedMesh` 铺杉树、碎石、中央虚线；
     左侧树更稀更远，保住右上灭点；布置用固定种子（`mulberry32`），刷新不能跳。
     树必须退到路侧 13m 之后（照片画框在 6.6m），否则会挡在照片前面。
     中央虚线是白路面上唯一的中灰物件（`#9a9da4`），既是标线也是车速反馈。
   - **树不能黑成一团**：树干用顶点色压到 0.55、树冠 1.0，材质再带 `emissive = color` 与按主题插值的
     `emissiveIntensity`（默认 0.7，森林 0.95）；夜色里纯靠环境光，树会完全溶进背景，什么剪影都看不见。
   - **暗部色值必须按「渲染后」反推**：渲染用 `NeutralToneMapping`，它会把暗部狠狠压掉一半
     （输入的 `0x26272c` 在画面上只剩 `#141417`，跟纯黑没区别）。想要画面上读到 `#3a3a40` 的深灰，
     材质色要写到 `0x4a4c55` 左右。写色板时先算这一步，别照着目标色直接填 —— 否则「地面」永远是黑的。
   - **路面两侧那圈 30m 的 verge 才是肉眼看到的「地面」**：真正的 ground 圆盘在 -52m，
     大多数时候根本不在画面里。verge 用 `MeshBasicMaterial`（不吃光），六个主题各自给色：
     Mountain `0x4a4c55` / Forest `0x344437` / Dawn `0x564335` / Dusk `0x463a52` / Midnight `0x323c4e`，
     雪地保持亮雪。压成近黑时整片地形消失，路和树都像悬在虚空里。
   - **八主题（Mountain / Snow / Forest / Dawn / Dusk / Midnight / Coast / Desert）只换颜色，不换几何**：色板在 `config.js` 的 `THEMES`，
     `themePalette(index)` 把 patch 覆盖到 `PALETTE`，`themeProfile(index)` 给非颜色参数；`MonochromeRoad.setTheme(index)`
     把 12 个「活体 Color」（背景、雾、路面、路肩、地面、树 color + emissive、碎石、车漆、天空四个 uniform）
     在 0.9s 内 `copy(from).lerp(to, k)`（`easeInOutCubic`），树的 `emissiveIntensity` 单独按数值插值。
     天空必须用 `ShaderMaterial` 才能插值 uniform，CanvasTexture 做不到。
     森林的密林层、海岸层、仙人掌层 / 灌木 / 岩石 / 星空 / 落雪 / 落日都只切透明度（`fadeLayers`），不重建 geometry；收尾时再把透明度到 0 的层关掉。
     雪地只铺地面/路肩，天空与雾保持暗色，车漆改深色 —— 全调亮会整屏发灰、白字全糊。
   - **自动轮播 20 秒一次（`MOTION.themeInterval`）**：没人操作时 `themeClock += dt`，到点 `setTheme(themeIndex + 1)`；
     任何 `pointerdown` / 空格都 `themeClock = 0` 重新计时，别在拖拽半途换场景。
     之前删过一次自动轮播，以为是它造成「画面一直闪」—— 真正的凶手是后处理链（见上），
     0.9s 的颜色插值本身是平滑的。切换通过 `onTheme` 回调把索引报回 `HomeView` 同步激活态。
   - **每个场景的物件必须真的不一样**：`THEMES.extras` 逐项开关，全部走 `fadeLayers`
     （`{ when, object, material, key }`）统一淡入淡出，**不许硬切 `visible`** —— 那就是一次闪：
     `flora: 'cacti'`（Desert，仙人掌：`CapsuleGeometry` 主干 + 两根折臂）、`flora: 'none'`（Coast）、
     `forestTrees`（Forest 密林层）、`bushes`（森林/黎明/暮色/沙漠的地被灌木）、
     `boulders`（山地/雪原/沙漠的大块岩石）、`stars`（Midnight 星空）、
     `snowfall`（Snow 落雪点云）、`sun`（Dawn/Dusk/Desert/Coast）、`moon`（Mountain/Snow/Forest/Midnight）、
     `coast`（沙滩/海/棕榈/灯塔/礁石/帆船）。
     沙漠里出现针叶杉树即视为 bug。
   - **天象不能是「圆球光」**：每个天体三层 `Sprite` —— 本体（轮廓）、光冕（日冕射线 / 月华）、外晕，
     全部 `AdditiveBlending` + `toneMapped: false` + `depthWrite: false` + `fog: false`，挂在跟随相机的天空球上。
     太阳本体走 `discTexture`，光冕用 `coronaTexture(211, 17, 1.12)`：射线角度/长度/粗细/亮度都抖动，
     `ctx.filter = 'blur(6px)'`，三段衰减（0.42 → 0.26 → 0.08），读起来是大气散射而不是星芒滤镜；
     月亮本体用 `moonTexture()`（临边昏暗 + 七团模糊月海 + 最外 3% `destination-out` 软化），月华走无射线柔光。
     外晕必须用 `fadeLayers` 的 `max` 控透明度（太阳 1/1/0.42、月亮 1/0.78/0.34），不能和本体一样实。
   - **HDR 过曝**：`toneMapped: false` 下把材质 `color` 写到 >1（太阳本体 ×2.1、月亮 `setRGB(2.0,2.08,2.2)`），
     输出会被钳到纯白；只给 0~1 的颜色，月亮永远是一块灰圆片。
     注意 DOM 遮罩是乘在画布结果上的：`.road__haze` 必须只压左侧文案区（`linear-gradient(100deg, …)`），
     整条横幅压暗会把右上的太阳/月亮一起压成灰片，3D 里再亮也顶不过去。
   - **星空 / 落雪 / 太阳 / 月亮必须贴着相机摆**：相机只有 36° 垂直视场、略俯视，画面里的天空只有
     地平线往上 0~24°。星空铺 `phi 1.15~1.56`（仰角 0~24°）；每帧按「当前视线方向 + yaw」重摆，
     `#placeCelestial(body, dir, yaw, height, spin)`：太阳 `-0.11 / 52`、月亮 `-0.2 / 118`（都落在右上天空），
     固定世界坐标摆会把它们转到脑后或糊住标题；光冕/外晕再按 `spin` 反向慢转，避免射线看起来是死贴图。
   - **森林的树根不能糊进地面**：林地 `ground` 提到 `0x2c3a2e`、`verge 0x344437`，树干顶点色 0.55，
     树色 `0x7f9c86` + `treeGlow 0.95`。地面纯黑时，再亮的树也像悬空的黑锥子。
   - **雪地必须配左侧压暗**：`HomeView` 的 `.cine__scrim` 只在 `snowScrim`（`theme.id === 'snow'`）时 `opacity: 1`，
     `linear-gradient(104deg, rgba(6,9,13,.78) 0%, … 62% 透明)`，否则标题压在亮雪上读不出来。
   - **主题分段控件必须有深色轨道**：白色胶囊压在白路面上会「消失」，只剩一行字。
     轨道 `rgba(9,9,11,.78)` + `padding 3px` + 胶囊圆角，按钮透明、激活项才是白胶囊 + 深字。
   - **海岸是独立模块 `coast.js`，整组默认隐藏**：沙坡从 7.2m 起坡、铺到 30m 压到 -4.3m，
     海面在 -2.9m、从 18m 一直铺到 400m（190~380m 化进雾色）。
     **海面必须高于沙坡外沿**（沙子在 ~22m 处沉到水下 → 那里是海岸线）：
     把海放在沙沿之下时，视线越过沙沿就一路向下，整片海被沙沿挡在背后，画面里只剩一大块沙地。
     **海岸主题必须藏掉主题共用的 30m 水平路肩**（`road.userData.verges`，`setTheme` 里
     `verge.visible = !coastal`）：它在 3.4m 视高下会把 30m 外的一切压到地平线以下，海只剩一条细线。
     海不能做成恒定高度圆盘（会被沙滩挡死），也不能铺到 620m（远段路面高出 37m，水面会爬到地平线以上像极光）。
     海要丰富：`uTime` 驱动三层波纹 + 浪尖碎光 + 贴岸白沫带（顶点属性 `vEdge` 标记靠岸边）；
     岸线外侧再摆棕榈（树干 + 七片下垂叶两批实例）、礁石、帆船，31% 处放一座灯塔。
     `uTime` / 淡入淡出走 `uFade`，只在 `coast.visible` 时推进。
   - **车每个场景换漆**：`carBody` 写进各主题 patch（Forest 墨绿 / Dawn 橙 / Dusk 紫 / Midnight 蓝 /
     Coast 青 / Desert 砖红 / Snow 深青蓝），切主题时和路面一起插值。
   - **车要够「酷」但别堆模型**：宽尾翼 + 两侧竖端板、双排气管、锥形尾焰 + 径向光晕 Sprite。
     尾焰的锥体从车后看是端面，只有一个橙点，必须叠一层 Sprite 光晕才读得出是火；
     但抖动频率必须 ≤ 12Hz（`sin(t*8.5)` / `sin(t*12.5)`），叠加色高频跳动在画面正中就是闪烁。
     位置在车尾 `z ≈ -2.4`、`toneMapped: false`，尾焰自带叠加光晕。
   - **车牌是车的辨识点**：`CanvasTexture` 画白底黑字（512×148，字号 700 76px 才装得下 10 个字符，
     `anisotropy = 8`），`MeshBasicMaterial({ toneMapped: false })` 挂在车尾 `z ≈ -2.4`、`rotation.y = π`，
     平面 0.62×0.18（比真车牌略大，13.5m 外的车尾只有一百多像素宽）。当前文案 `lzxiang814`。
   - **构图必然是左下 → 右上**：相机吊在车后 13.5m、车行方向右侧 1.6m、高 3.4m，
     闭合曲线恒为右转，灭点永远落在右上；曲率不能出现负值，否则构图会翻面。
   - 照片画框是**面向屏幕的平面**：每帧只绕 Y 轴 `lookAt` 相机，只按 `1/depth` 缩放；
     贴图用 `fitCover()` 算 repeat/offset，不要拉伸。
     **剔除必须按「四角投影完全出画」判断，绝不能按距离或透明度淡入淡出**：
     13m 一个画框、16m/s 的车速下，按距离剔除等于每 0.8 秒就有一整块照片凭空消失/出现，
     用户看到的就是「画面一直在闪」；半透明照片还会透出背景并在帧间排序跳变。
     判定顺序：`camera.updateMatrixWorld()` → `face.lookAt()` → `face.updateMatrixWorld(true)`
     → 四角投影；任一角相机空间 `z > -1.5` 直接判不可见（贴脸照片会占半屏）。
   - **跑车不能用 Box 拼**：车身与座舱用自写放样（沿车长排一串超椭圆圆角截面再缝合），
     轮子是圆柱胎 + 圆环轮肩 + 圆环轮辋 + 5 根辐条 + 刹车盘，配轮眉半环。
     玻璃必须深且粗（`roughness ≈ 0.42`）：一做成镜面，车顶就把主光整片反射成灰枕头。
     车灯用 `MeshBasicMaterial` 的 HDR 颜色（>1）配合叠加发光 Sprite，不依赖后处理。
   - **禁止接 EffectComposer / UnrealBloomPass / 任何离屏后处理链**：只要画面经过
     「离屏 render target → 全屏 pass → 默认帧缓冲」，合成器就会间歇性地整帧拿不到内容
     （实测 16 帧里 3~7 帧整块 canvas 变黑，只剩 DOM 上的白字，用户看到的就是「画面一直闪」；
     带 MSAA `samples` 的 HalfFloat target 最严重，`.road__grain` / `preserveDrawingBuffer` 都不是原因）。
     必须 `renderer.setRenderTarget(null)` + `renderer.render(scene, camera)` 直出，
     抗锯齿交给 `WebGLRenderer({ antialias: true })` 的默认帧缓冲。
     验收方法：有头 Edge / Playwright 连续截 48 帧，hero 区域白像素占比不得出现 < 0.05 的帧。
   - **实时阴影整段关闭**（主光每帧跟相机走，阴影纹素每帧挪动，边缘会持续爬动；
     路面靠自发光读白，关掉直射光几乎看不出差别）。
   - `resize()` 必须先比较尺寸再调 `setSize`：多调一次就会重建画布资源、清空绘制缓冲，
     表现为一次黑屏。
   - **交互不能只有点击**：拖拽环视（绕车 pivot 转 yaw/pitch，松手阻尼回零，`setPointerCapture` 保证拖出画布也能收尾，
     拖过 6px 后吞掉补发的 click）、悬停放大 + 边框自发光、空格暂停、滚出视口自动停 rAF。
   - **点击任意画框必须能放映**：`Raycaster` 拾取平面，精确点没中时按 ±10/±18px 探一圈；
     命中后相机沿视线推进 0.95s（`focusDistance ≈ 6m`），再用 `Vector3.project()` 算出画框的视口矩形，
     连同 `item` 一起 `emit('select', { item, rect })` 交给 `CinemaOverlay.vue`。
     画框一直在以 16m/s 前进，验收点击时必须先空格暂停，否则「截图里的位置」和「点击时的位置」已经不同。
   - 首屏按钮与底部提示条**不许用 `backdrop-filter`**：它们压在白色路面上，模糊会把路面糊成亮斑；
     用深色实底（`rgba(9,9,11,.78)`）+ 一圈发丝白边。
     底部一行是「左侧场景分段控件 + 右侧 `Drag to look around · Space to pause`」，
     1080px 以下先撤提示、保住八个场景按钮；整条栏 `pointer-events: none`，只有分段控件恢复 `auto`。
1. **放映层**（`CinemaOverlay.vue`，`Teleport` 到 body）做两段式转场：
   硬切到黑 + 一道白光（`cinema-flash`）→ 画面用 `clip-path: inset()` 从被点画框的屏幕矩形
   扩到满屏（0.95s `cubic-bezier(.16,1,.3,1)`），同时从 `scale(1.16) blur(14px) brightness(.32)`
   收敛到清晰 → 文字错峰上浮（.52/.66/.82/.96s）。
   关闭是反向：黑底先淡出、画面缩回原画框，0.66s 后才卸载；Esc 与按钮都要能关，锁 `body` 滚动，
   同时 `RoadScene.resetView()` 让相机 0.8s 退回车上。
2. **文案**：压在左上角天空区域，左对齐，整块 `max-width: 730px`（含内边距），
   标题 `clamp(38px, 5.4vw, 82px)`、600 字重、`letter-spacing: -0.045em`、行高 0.98；
   副标题 `max-width: 560px` / 17px / 1.62、`rgba(245,245,247,.72)`；按钮是**白色胶囊 + 黑玻璃胶囊**
   （玻璃按钮必须压暗，画框会从它后面经过；首屏不许出现蓝色，否则破坏黑白）。
   视觉重心要向画面右下方铺开一点，不要缩成左上角一小撮字。
   文案层 `pointer-events: none`，只有按钮恢复 `auto`，否则会挡住画框点击。
3. **入场**：文案 `rise-in` 由 `heroReady` 闸门控制（`MonochromeRoad` 首帧后 `onReady`，2.5s 超时兜底）；
   滚动 `--p` = `scrollY / innerHeight`，只让文案 `opacity → 0` 并下移退场，场景继续行驶。
4. **性能**：`dpr ≤ 2`；`IntersectionObserver` 离开视口时暂停 rAF；
   `prefers-reduced-motion` 下车停住但场景仍渲染、画框仍可点。卸载时 `dispose()` 释放 geometry/material/texture。
5. **深色精选段** `$color-bg-cinema-soft`，三张 4:5 竖幅，编号 `01/02/03` + 标题，
   hover 只放大 4% 并提亮，不加彩色描边。
6. **白色档案区** 承载列表与筛选，保持可读性。
7. **黑场收尾**：一句大标题 + 一个白色胶囊，把视线交回页脚。
8. `prefers-reduced-motion` 下必须直接给终态：文字可见、放映层动画关闭。
9. **首屏是黑白的，但照片是彩色的**：天空、路面、跑车、画框、护栏、按钮、导航 CTA 一律黑白灰；
   **照片（画框里与放映层里）保留原色**，不要加 `grayscale()` —— 黑白是布景，不是滤镜。
   别处仍按 Apple 浅色体系用蓝色主色。

深色段只能用 `$color-bg-cinema` / `$color-bg-cinema-soft` / `$color-text-on-dark` /
`$color-text-on-dark-soft` / `$color-border-on-dark`，不得写死其他黑色。

## 唯一色源

颜色只能来自 `frontend/src/styles/tokens.scss`（SCSS 变量）与 `base.scss` 的 `:root`。
组件里除照片上的浮层外，禁止写死色值。

| 用途 | 变量 | 值 |
| --- | --- | --- |
| 主色 / 链接 / 按钮 | `$color-primary` | `#0071e3` |
| 主色 hover | `$color-primary-dark` | `#005bb5` |
| 强调 / 深色页链接 | `$color-accent` | `#2997ff` |
| 主文字 | `$color-text` | `#1d1d1f` |
| 次文字 | `$color-text-secondary` | `#6e6e73` |
| 弱文字 | `$color-text-muted` | `#86868b` |
| 页面底 | `$color-bg-page` | `#fbfbfd` |
| 卡片底 | `$color-bg-card` | `#ffffff` |
| 浅灰填充 / 页脚 | `$color-bg-hover` | `#f5f5f7` |
| 发丝边 | `$color-border` | `#e5e5ea` |

深色沉浸页只有图片详情 `/photo/:id`，在页面根节点局部覆写 `--el-*` 与文字色，
不得为了深色页修改全局令牌。

## 登录 / 注册：雪谷极光 3D 片场 + 直升机分镜

- 登录与注册是**同一个页面（`views/AuthView.vue`）的两种状态**，两条路由指向同一组件，
  `mode` 跟 `route.name` 双向同步（`router.replace`），切换时组件不重建，才能做飞行动画。
- 背景是**真的 3D 场景**（`components/auth/AuthBackdrop.vue` → `three/auth/AuthScene.js`）：
  雪谷 + 极光 + 星空 + 雪原陈设 + 一架悬停的直升机。**不要退回静态剧照**，
  也**不要做成分段胶囊点击切换** —— 用户明确否掉了这两种方案。
- 模块划分（全部在 `frontend/src/three/auth/`）：
  `config.js`（相机/分镜/两种模式的色板）、`sky.js`（渐变穹顶 + 星 + 月亮 HDR）、
  `aurora.js`（四片竖直幕帘 Shader，additive）、`landscape.js`（三圈远山 + 雪原几何，
  并导出 `groundHeightAt()` 供陈设落地）、`props.js`（雪丘 / 礁石 / 三层锥体杉树，InstancedMesh）、
  `details.js`（前景冰棱 / 远景木屋暖窗 / 贴地低雾 / 女孩家的木屋与门）、
  `girl.js`（小女孩：造型 + 过场时间轴 + 扬雪粒子）、`snow.js`（飘雪，点精灵贴图）、
  `helicopter.js`（放样机身 + 旋翼 + 探照灯 + 下洗雪尘）、
  `AuthScene.js`（组装 / 分镜 / 飞行 / 主题插值 / resize / dispose）。
- **开场是一次电影式推进**：`INTRO` 从 `(0, 58, 150)` 推到 `(0, 8.6, 46)`，5.2s、`easeOutCubic`，
  注视点从高处收到山脊上方 —— 收尾必须接近水平（俯视 8° 时下方 85% 全是空雪地，谈不上恢宏）。
  卡片在 1.35s 之后才浮上来（`.auth__frame` 的 `auth-frame-in`），先看雪谷再看表单。
- **直升机停在表单右侧、整架落在亮雪上，不压卡片**（`anchor: { outward: 0.075, down: 0.36 }`）：
  早先为了让「停靠」成立把机头压进卡里 1.4%，结果白色卡面上糊着一块深色机体，
  表单右侧那几行字全被压掉 —— 用户明确要求让开。现在整机停在卡片右外沿之外，
  机体落在雪面上、旋翼盘高过卡片下沿，既不遮表单，机体轮廓也衬着亮雪读得清楚。
  `down` 从 5.5% 加到 36% 是刻意的：右上角那块背景是深色山脊，深藏青机体几乎看不见；
  压到右侧下段、衬着亮雪，一行横着的机体才读得出来，也和左下角的女孩一左一右夹住表单。
  停靠侧固定为右（`flightSide = 1`），不随登录 / 注册翻边，只有镜头会摆。
  停靠点是屏幕空间算的，不是世界坐标：页面用 `offsetWidth/offsetTop` 量出卡片停稳后的矩形
  （不能用 `getBoundingClientRect`，此刻它可能正在飞行/浮入动画里），
  经 `AuthBackdrop.setCardRect()` 传给场景；场景按「镜头落位后」的机位造一台探针相机，
  用 `Vector3.unproject()` + 射线求交把屏幕点反投影到悬停平面（`hoverZ = -2`）。
  拿水平半宽推 `x` 会差出近一倍，别再回去。
  机头 `lookAt` 卡片中心方向；`x` 夹在 0.13~0.87：机头朝表单时六米尾梁朝画面外伸，
  1180 宽按下沿算会被切掉。竖屏（`aspect < 1.25`）整机关掉。
- **切换登录 / 注册是手势，不是点击**：按住卡片左右拖，卡片跟手位移 + `rotateY` 轻微侧转；
  松手位移过 96px（或甩得够快）就把这张甩出去、换另一张从那侧飞回来，没拖够就弹回正中。
  触控板横滑（`deltaX` 累积，800ms 固定窗口内累计过 70 就切）走同一套逻辑。
  `touch-action: pan-y` 保证纵向滚动与选字不被抢；输入框 / 按钮 / 链接上按下不接管。
  拖拽期间 `user-select: none`、`transition: none`（必须逐帧跟手）。
  页面右下角那行 `Drag the card left or right to switch` 是唯一的手势提示，
  不是切换按钮 —— 之前的「Create account →」文字按钮只是键盘/读屏的兜底入口。
  拖卡片时把 `dx` 一并传给场景（`setCardDrag`），直升机会跟着卡片挪，停靠感来自「它俩是一个东西」。
- **片场里还有一个小女孩的过场**（`three/auth/girl.js`，6.2 秒后自动开演，不需要任何操作）：
  木屋的门先转开（`details.js` 的 `HOME`，门板挂铰链组），她从门洞里走出来，
  捧着一捧雪走到表单左下角，站定仰头笑 → 把雪扬出去 → 转一圈 → 之后在表单左下的空地上边走边跳舞。
  **人物本体是 Blender 做的网格，不是 three.js 里的程序化几何**（用户明确要求「一模一样」，
  手搓的低多边形达不到）。流程固定为三段：
  1. `tools/elsa_build.py`（bpy + Blender 5.0 CLI `--background --factory-startup --python`）建人、导出
     `frontend/public/models/elsa.glb`，同时存一份 `tools/elsa.blend` 供复查；
  2. `tools/elsa_render.py` 打开 `.blend` 渲四张预览（正面 / 四分之三 / 头部两张，Cycles CPU 24 samples、
     `Standard` 视图变换 —— AgX 会把奶白高压成灰白，灯光功率 95/34/190，再高就发白）；
  3. `girl.js` 用 `GLTFLoader` 异步加载 GLB，按名字取关节驱动。
  **不要再退回程序化建模**：那套代码已删干净，回退等于把踩过的坑重踩一遍。
  - 坐标系：Blender 里人朝 -Y、Z 向上；`export_yup=True` 后 three.js 里脸朝 **+Z**，
    与原来那套姿势角度完全兼容（`applyPose` 里的 yaw / roll 不用重算）。
  - 关节是**空物体**，名字就是 JS 侧变量：`girl / body / waist / head / armL / armR / elbowL / elbowR /
    mouth / eyeL / eyeR / browL / browR`。glTF 保留层级，`getObjectByName` 直接取。
  - 尺寸：脚底 z=0、头顶 2.25；`head` 空物体 `scale 0.68` 在 z=2.00、`waist` 在 z=1.30。
    three.js 侧 `root.scale.setScalar(3.4)`（屏幕上约 200px，再小五官就只剩色块）。
  - 造型（按参考图）：**白金发**（0.910/0.872/0.768，`sheen` 0.30）+ 冠辫（三条 19 匝绞股绕一圈，
    压在发量最大的 θ×0.55 那圈，贴发际线就成了发箍）+ 右侧长侧辫（三股 11 匝，越肩垂到胸口，
    `x` 要外移到 0.18 才不埋进胸口）+ 冰蓝 A 字长裙 + 白色蕾丝 V 领（alpha 0.84，0.62 会透出蓝身）+ 窄腰带。
  - 发壳是**参数化曲面**（64×24 双层，内层 0.985）：发际线按方位角变化（正前 1.02、耳侧 1.75、后颈 2.05），
    叠 `cos^24` 的美人尖；`v>0.55` 之后把边缘收回到颅骨表面 +5mm —— 悬空的发壳边缘在额头上就是一道帽檐。
    表面叠 `sin(7a + 2.6v)` 的浅沟（相位带 v，沟槽才是从额头往后脑走的发流，纯环向波纹像水面荡漾）。
  - 五官全是**几何体**（贴图五官在 100px 会被 mipmap 抹成灰点）：杏仁眼裂 0.046/0.024/0.016、
    虹膜 0.017（顶满眼睑就是两颗塑料眼珠）、管状睫毛外眼角上挑、`catmull` 圆弧眉毛（0.0046 管径，
    离眼 0.042 —— 0.072 时中间空出一条额头，读成惊愕脸）、鼻梁棱 + 鼻尖椭球、上下唇透镜 + 上扬唇缝、腮红 alpha 0.05。
    **眉毛不能靠 `scale=(-1,1,1)` 镜像**：镜像缩放会让左右不对称，必须按 side 直接生成镜像圆弧。
  **笑意必须是 blend，不是两套脸**：GLB 到货后 `smile` 0~1 连续驱动 `mouth.scale`
  （0.92/0.78 → 1.2/1.98）、眼睛眯起 16%、眉毛抬起 0.008、`blushMaterial.opacity` 0.05 → 0.25；
  `smileK` 每帧按 `1 - exp(-5dt)` 逼近目标，收尾叠一点轻颤。两张嘴切 `visible` 在远景里就是一张死脸（踩过）。
  **左眼镜像是负缩放**（Blender 里 `pivot.scale=(side,1,1)`）：JS 改 `eye.scale` 时必须保住符号，
  写成 `eye.scale.set((eye.scale.x < 0 ? -1 : 1) * k, k, k)`，否则笑的时候左眼会翻面。
  GLB 是异步到的：`update()` 先跑在占位节点上（`if (!loaded) return`），到货后替换同名节点，时间轴一行不用改。
  她的站位是**屏幕锚点**，不是固定世界坐标：`AuthScene#layout` 取卡片左边缘再往左 5.2% 视口宽、
  脚底 0.86 屏高，经探针相机反投影求出世界 `x`，每帧传给 `girl.update(dt, storyT, anchor)`；
  这样 1440 / 1180、登录 / 注册四种情况下她都稳稳站在卡片左边（固定坐标在注册模式下会贴到取景框边缘）。
  **直升机固定停在卡片右边**（`flightSide = 1`，`anchor.down = 0.36`，机体压在亮雪上），
  只有镜头随模式左右摆 —— 女孩左、直升机右，两个主体一边一个。
  撒雪是 320 个加色 `Points`（尺寸 0.2，大了会像肥皂泡），撒手点在胸前，重力 4.4，1.9s 淡出；
  脚下有一片随跳跃收缩的深蓝软影，否则人物像贴纸浮在雪面上。
  撒完雪后进入 **6.4s 一轮**的舞蹈：起手 → 换侧 → 转圈 → 屈膝致意 → 收势，
  **同时她在那块空地上真的走位**：`x/z` 叠两条不同周期的正弦（`sin(idle*0.44)*1.25` 世界单位横向、
  `sin(idle*0.31)*0.7` 前后），身体朝行进方向偏一点、`walkAmount = 0.9` 叠步伐起伏 ——
  原地比划手臂读起来是「机械舞」（用户原话：跳舞要在这部分走动）。摆幅上限卡在「裙边不碰卡片左沿」。
  手臂向外张的角度由**肩的 z 角**给、弧线由**肘的 z 角**给（正面看时前弯会被透视吃掉）；
  肘收太狠手会贴回腰上读成「叉腰」，收 0.15 rad 左右刚好。
  跳舞时身体只有极轻的重心横移（`stepX ±0.03`）和 0.045 rad 的转向，只动手臂会像机械臂；
  但这几项是**上限**：走路 `roll 0.009 / stepX 0.006`、原地 `yaw 0.045`，再大远景里就是全身左右扭摆（用户主诉）。
  裙摆挂在 `waist` 组（`body` 的子节点）：外扩 `skirtFlare`、侧摆 `skirtSway`、前后倾 `skirtTilt`
  都作用在腰以下，上身侧弯/前倾时接缝不再撕开 —— 之前裙子和上身平级挂在 `root` 下，
  扭腰时上身转、裙子不转，腰线会断开。
  走路没有腿：靠起伏 + 裙摆前后摆 + 上身一点点前倾（`walkPhase` 驱动 0.08 的 hop）。
  **左右 roll 必须压到 0.022 以内**（原来是 0.075）、`stepX` 只留 0.015 ——
  这是「走路姿势很奇怪、左右扭摆」的根因，远景里 4° 的摆就是一路扭秧歌；
  跳舞段的 `roll` 也从 0.09 收到 0.03，重心横向移动改用 `stepX` 平移而不是旋转。
  **跳舞抬臂不许抬到水平**（`leftRise` 幅度 0.72，原来 1.0）：1.3 rad 就是一条横伸的直臂，
  远景读成 T 字体操；抬起那条胳膊的 `elbowLz` 反而要**解开**（-0.5），
  让小臂顺着弧线往外上方走 —— 继续往里收就成了手肘外翻、手垂在胯边的「鸡翅」。
  捧雪时肘的侧弯只收 0.12：收多了两只手会在雪团后面并拢，正面只剩一个白球浮在胸前。
  `prefers-reduced-motion` 下不演走路转圈，直接站在表单边笑着。
- 背景陈设要**散开**：冰棱按 `side * (26 + pow(random,1.5)*62)` 铺到镜头两侧，
  别再挤成一簇；同时 `clearsStage()` 把木屋门前到表单左下那块空地留出来给女孩走。
- 极光**不能做成圆柱内壁**：透视下边界会变成直边，越过山脊只剩几个绿尖角，像贴了绿纸。
  必须是若干竖直平面 + 噪声撕开的下缘 + 左右淡出 + `AdditiveBlending` + `fog: false`。
- 雪原必须有**中高频起伏 + 程序化雪面贴图 + 雪丘/礁石/杉树**：单靠低频正弦时，
  150m 的雪地会被读成「一片蓝色的湖」。
- 卡片是**实白 `#ffffff` + 大投影 + 发丝白边**（试过 76% 半透明雪雾玻璃，
  雪谷会从表单里透出来、可读性明显变差，已回滚）。**不要 `backdrop-filter`**：
  Chrome 会把背景里的极光单独模糊后错位复制，在卡片上留下灰斑（已实测复现）。
- 切换交互由页面承担（不跳路由）：手势甩出（见上）→ 卡片沿 `--dir` 飞出
  （`is-out`，0.46s ease-out）→ 黑边 `scaleY` 收进上下 6.5vh →
  内容在 `is-pre`（无过渡）那一帧换掉 → 从另一侧飞回（`is-in`，0.94s）+ 一道扫光。
  黑边用 `transform: scaleY` 而不是 `height`：这段正好是主线程最忙的一刻。
- 表单切换：`ResizeObserver` 量当前 pane 高度 → 外层 `transition: height`；
  字段按 `--d` 错峰上浮；非激活 pane 挂 `inert` + `pointer-events: none`；
  注册页额外给密码强度三格条。指针视差在 `.auth__surface`（内层），
  外壳的 `transform` 留给飞行，两个动画才不会互相覆盖。
- 左侧人像必须**去色 + 冷调 + 暗角**：`grayscale(1)` + `::before`（color 混合的青调）
  + `::after`（顶部压暗 / 底部压黑 / 径向暗角）。注册那张原片偏亮偏灰，
  再加 `background-blend-mode: multiply` + 冷灰 `background-color` 压成夜景人像。
- 背景是 `position: fixed; inset: 0`：要铺到导航栏背后，半透明黑导航压在雪谷上才是开场；
  只铺卡片那块会让导航栏背后透出白底、被抬成一条灰带。
- 路由 `meta: { guestOnly, immersive, darkNav }`，导航栏走黑玻璃（`--dark` 比首页更实，0.82）。


## 图片详情页 `/photo/:id`

- 深色沉浸页必须由 `DefaultLayout` 的 `.layout--dark` **自己铺 `$color-ink`**：
  全站不再挂 3D 环境背景，写 `transparent` 会直接露出 `body` 的近白底，浅色文字全部看不见。
- 页面是「左图右信息」两栏：`max-width: 1280px`、`grid-template-columns: minmax(0,1fr) 360px`，
  `$bp-lg` 以下回退单列；信息栏宽屏下元信息改两列网格，作者条去掉上边框。
- 图片裸露居中（无白卡、无边框），只给圆角 + 极淡描边 + 投影，背后一圈柔光；
  `--cap-h: calc(100vh - 190px)` 保证竖图一屏内看全。

## 排版

- `$font-sans` = SF Pro → -apple-system → Inter → 系统中文。
- 大标题 600 字重、负字距 `-0.03em`、行高 1.06；正文 14px / 1.55。
- 页面标题统一 `.page-head__title`，不要自造层级。

## 形状与阴影

- 卡片 18px、控件 12px、按钮 980px 胶囊。
- 阴影只用 `$shadow-card` / `$shadow-hover` / `$shadow-pop`。
- 照片卡片必须带真实圆角 + 极淡投影，禁止给照片叠加彩色描边。

## 动效

- 曲线 `cubic-bezier(0.25, 0.1, 0.25, 1)`，0.2–0.45s。
- 路由切换只做淡入 + 8px 上浮（`.neon-*` 类名保留）。
- 首页 hero 的动感来自 **Three.js 山路场景**（跑车前进 + 画框流动 + 点击推进），不是 CSS 透视卡片；
  场景状态只存在一个 `carU` 变量里，不要拆成多套动画。
- 3D 只出现在首页 hero 的 WebGL 画布；页面背景保持纯白/纯黑，不铺第二块画布。

## 验收清单

1. `grep -Rn "201, 169, 110\|#c9a96e\|#0c0d10" frontend/src` 为空。
2. `npm run build` 通过。
3. 浏览器逐页看：首页、搜索、分类、详情、登录、注册、个人中心、后台。
4. 白底上不得出现白字白底或看不见的白描边；黑场上不得出现黑字。
5. 控制台零报错。
6. 界面文案必须全英文（品牌 Lumen），grep 模板属性与字符串不应有中文；
   中文只允许出现在代码注释与后端数据里。
7. 首屏验收：打开即见动态山路（不能是静态图）；空格能停、拖拽能环视、悬停画框 cursor 变 `pointer`；
   点击画框必须弹出 `.cinema` 且 `img.naturalWidth > 0`。
   画框持续移动，点击验收要先暂停再用 canvas 自身的坐标验证，不要用截图目测的位置去点。
