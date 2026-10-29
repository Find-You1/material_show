/**
 * v-tilt —— 卡片 3D 倾斜 + 高光追踪。
 *
 * 为什么用指令而不是 composable：瀑布流卡片是按数组渲染的、本身无状态，
 * 指令能跟着元素的生命周期自动挂载 / 卸载，不用在业务组件里多写一份状态。
 *
 * 性能约定（改的时候别破坏）：
 * 1. **模块级单例**：整页只有一份 document 级 pointermove（passive）+ 单个 rAF，
 *    同时只服务「指针正下方的那一张卡」。绝不每张卡挂一个监听。
 * 2. 命中一次只读一次 getBoundingClientRect，之后每帧只写 transform 与 CSS 变量。
 * 3. 只写 transform / 自定义属性，不碰 left/top/width/height —— 与 useMasonry 的
 *    绝对定位互不干扰。
 * 4. 触屏（pointer: coarse）与系统「减少动态效果」直接不启用。
 */

const MAX_TILT = 6 // 最大倾角（度）
const LIFT = 3 // 悬停时抬起的像素

let refCount = 0
let enabled = false
let rafId = 0

let activeEl = null
let activeRect = null
let pendingX = 0
let pendingY = 0
let hasPending = false

function supportsTilt() {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const coarse = window.matchMedia('(pointer: coarse)').matches
  return !reduce && !coarse
}

function applyFrame() {
  rafId = 0
  if (!activeEl || !activeRect || !hasPending) return
  hasPending = false

  const nx = pendingX - 0.5
  const ny = pendingY - 0.5
  const ry = (nx * MAX_TILT * 2).toFixed(2)
  const rx = (-ny * MAX_TILT * 2).toFixed(2)

  activeEl.style.transform =
    `translateY(-${LIFT}px) rotateX(${rx}deg) rotateY(${ry}deg)`
  // 高光层跟着指针走（百分比，交给 CSS 的 radial-gradient 使用）
  activeEl.style.setProperty('--mx', `${(pendingX * 100).toFixed(2)}%`)
  activeEl.style.setProperty('--my', `${(pendingY * 100).toFixed(2)}%`)
}

function schedule() {
  if (!rafId) rafId = requestAnimationFrame(applyFrame)
}

function activate(el) {
  // 逐帧写 transform 时不能有 CSS 过渡，否则每帧都在追自己的过渡值、拖影
  el.style.transition = 'none'
  el.classList.add('is-tilting')
}

function deactivate(el) {
  if (!el) return
  // 还原 CSS 过渡，让 transform 从当前矩阵平滑回到初始态
  el.style.transition = ''
  el.classList.remove('is-tilting')
  el.style.transform = ''
  el.style.removeProperty('--mx')
  el.style.removeProperty('--my')
}

function onPointerMove(event) {
  const target = event.target
  const el = target instanceof Element ? target.closest('[data-tilt]') : null

  if (el !== activeEl) {
    deactivate(activeEl)
    activeEl = el
    activeRect = null
    if (!el) return
    activeRect = el.getBoundingClientRect()
    activate(el)
  }

  if (!activeEl) return
  if (!activeRect || !activeRect.width || !activeRect.height) {
    activeRect = activeEl.getBoundingClientRect()
    if (!activeRect.width || !activeRect.height) return
  }

  pendingX = (event.clientX - activeRect.left) / activeRect.width
  pendingY = (event.clientY - activeRect.top) / activeRect.height
  hasPending = true
  schedule()
}

// 滚动 / 缩放后缓存的 rect 就过期了，置空让下一次 pointermove 重新量一次
function invalidateRect() {
  activeRect = null
}

function resetAll() {
  deactivate(activeEl)
  activeEl = null
  activeRect = null
  hasPending = false
  if (rafId) {
    cancelAnimationFrame(rafId)
    rafId = 0
  }
}

function start() {
  enabled = supportsTilt()
  if (!enabled) return
  document.addEventListener('pointermove', onPointerMove, { passive: true })
  window.addEventListener('scroll', invalidateRect, { passive: true })
  window.addEventListener('resize', invalidateRect, { passive: true })
  document.documentElement.addEventListener('mouseleave', resetAll)
}

function stop() {
  if (!enabled) return
  document.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('scroll', invalidateRect)
  window.removeEventListener('resize', invalidateRect)
  document.documentElement.removeEventListener('mouseleave', resetAll)
  resetAll()
  enabled = false
}

export const tilt = {
  mounted(el) {
    el.setAttribute('data-tilt', '')
    refCount += 1
    if (refCount === 1) start()
  },
  unmounted(el) {
    if (activeEl === el) {
      deactivate(el)
      activeEl = null
      activeRect = null
    }
    refCount = Math.max(0, refCount - 1)
    if (refCount === 0) stop()
  },
}

export default tilt
