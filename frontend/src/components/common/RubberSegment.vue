<template>
  <div
    ref="trackEl"
    class="rseg"
    :class="[`rseg--${size}`, { 'is-disabled': disabled }]"
    :style="cssVars"
    role="radiogroup"
    :aria-label="ariaLabel"
    @pointerdown="onPointerDown"
  >
    <div ref="thumbEl" class="rseg__thumb" aria-hidden="true" />

    <button
      v-for="(it, i) in normalized"
      :key="`${i}-${it.value}`"
      ref="slotEls"
      type="button"
      class="rseg__slot"
      :class="{ 'is-active': it.value === current }"
      :data-index="i"
      role="radio"
      :aria-checked="it.value === current"
      :tabindex="it.value === current ? 0 : -1"
      :disabled="disabled"
      @click="onSlotClick(i)"
      @keydown="onKeydown"
    >
      {{ it.label }}
    </button>
  </div>
</template>

<script setup>
/**
 * 橡皮筋分段控件（移植自 reactbits 的 Rubber Segment）。
 *
 * 手感由三段动画拼出来，不是普通滑动：
 *   1) 撑开 —— 拇指从旧槽向「旧∪新」的并集横向扩张（elastic stretch）
 *   2) 收拢 —— 收到新槽并让拖尾端多跑 squash 像素
 *   3) 回弹 —— 用带过冲的缓动落回新槽
 * 另外支持按住拖动与甩动（flick），松手后按甩动方向与速度吸附到最近的槽。
 *
 * 性能上做了三件事，都是为了不卡：
 *   - 拇指的位移**不走 Vue 响应式**。动画交给 Web Animations API 一次性投递整段
 *     keyframe（与 paint 帧对齐），拖拽期间直接写 style；组件在这过程中不重渲染。
 *   - ResizeObserver 回调加 150ms 防抖，并且槽位数量没变时不重新量宽，
 *     避免换页时反复 offsetWidth 造成 layout thrashing。
 *   - .rseg 上做 layout containment，把重排范围关在这一小块里。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps({
  /** string | { value, label }[] */
  items: { type: Array, required: true },
  modelValue: { type: String, default: undefined },
  /** sm | md | lg */
  size: { type: String, default: 'md' },
  radius: { type: Number, default: 10 },
  /** 拇指与轨道边缘的间距 */
  inset: { type: Number, default: 3 },
  // 以下四个颜色默认值是按本站 Apple 浅色主题调好的，需要时可在调用处覆盖
  trackColor: { type: String, default: '#f0f0f3' },
  thumbColor: { type: String, default: '#ffffff' },
  textColor: { type: String, default: '' },
  activeTextColor: { type: String, default: '' },
  equalSlots: { type: Boolean, default: true },
  /** 撑开幅度：100 = 完全覆盖并集，0 = 普通滑动 */
  stretch: { type: Number, default: 100 },
  /** 拖尾端过冲的像素数，0 取消挤压感 */
  squash: { type: Number, default: 3 },
  /** 整体快慢倍率，0.25 就是慢动作 */
  speed: { type: Number, default: 1 },
  /** 甩动最多额外带出多少像素 */
  glide: { type: Number, default: 75 },
  draggable: { type: Boolean, default: true },
  disabled: { type: Boolean, default: false },
  ariaLabel: { type: String, default: 'Segmented control' },
})

const emit = defineEmits(['update:modelValue', 'change'])

// 回弹缓动：末端轻微过冲，是「橡皮」味的来源
const OVERSHOOT = 'cubic-bezier(0.34, 1.42, 0.64, 1)'
const BASE_MS = 300
// 小于这个位移算「点击」，不做拖拽
const TAP_SLOP = 6
// 容器尺寸变化后的重新量宽延迟：换页时页面会连续重排，晚一点再量才测得到最终值
const RELAYOUT_DEBOUNCE = 150

const trackEl = ref(null)
const thumbEl = ref(null)
const slotEls = ref([])

const current = ref('')

// 拇指当前几何。故意用普通变量而不是 ref：动画全程都不需要触发重渲染。
let left = 0
let width = 0
let anim = null
let observer = null
let relayTimer = 0
let drag = null
let swallowClick = false
// 上一次量宽时的槽位数量，用来跳过重复的 offsetWidth 遍历
let measuredCount = -1

const normalized = computed(() =>
  (props.items || []).map((it) =>
    typeof it === 'string'
      ? { value: it, label: it }
      : { value: it.value, label: it.label ?? it.value },
  ),
)

const cssVars = computed(() => {
  const vars = {
    '--rseg-inset': `${props.inset}px`,
    '--rseg-radius': `${props.radius}px`,
    '--rseg-thumb-radius': `${Math.max(0, props.radius - props.inset)}px`,
    '--rseg-track': props.trackColor,
    '--rseg-thumb': props.thumbColor,
  }
  // 空字符串会让 color 声明在计算期失效，干脆不写，交给 CSS 的 var() 兜底值
  if (props.textColor) vars['--rseg-text'] = props.textColor
  if (props.activeTextColor) vars['--rseg-text-active'] = props.activeTextColor
  return vars
})

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v))
}

/** 直接写 style，不动响应式：这是动画与拖拽期间唯一会碰 DOM 的地方 */
function setThumb(l, w, dur = 0, ease = 'linear') {
  const el = thumbEl.value
  if (!el) return
  left = l
  width = w
  el.style.transition = dur > 0 ? `left ${dur}ms ${ease}, width ${dur}ms ${ease}` : 'none'
  el.style.left = `${l}px`
  el.style.width = `${w}px`
}

/** 从视觉状态（可能是动画中途）读回拇指几何，用于打断动画时接着往下算 */
function readThumb() {
  const el = thumbEl.value
  const track = trackEl.value
  if (!el || !track) return
  const box = el.getBoundingClientRect()
  const base = track.getBoundingClientRect()
  left = box.left - base.left
  width = box.width
}

/** 停掉进行中的动画，并把当前视觉位置固化到内联样式，避免样式回弹 */
function stopAnim() {
  if (!anim) return
  const running = anim
  anim = null
  readThumb()
  running.cancel()
  const el = thumbEl.value
  if (el) {
    el.style.transition = 'none'
    el.style.left = `${left}px`
    el.style.width = `${width}px`
  }
}

function jumpTo(index, animate = false) {
  const el = slotEls.value[index]
  if (!el) return
  stopAnim()
  const ms = animate ? BASE_MS / Math.max(0.05, props.speed) : 0
  setThumb(el.offsetLeft, el.offsetWidth, ms, OVERSHOOT)
}

/** 三段式：撑开 → 收拢过冲 → 回弹到位。整段交给 Web Animations API 一次投递 */
function rubberTo(index) {
  const slot = slotEls.value[index]
  const thumb = thumbEl.value
  if (!slot || !thumb) return
  stopAnim()

  const T = BASE_MS / Math.max(0.05, props.speed)
  const prevLeft = left
  const prevWidth = width
  const nextLeft = slot.offsetLeft
  const nextWidth = slot.offsetWidth
  const f = clamp(props.stretch / 100, 0, 1)

  if (f === 0) {
    setThumb(nextLeft, nextWidth, T, OVERSHOOT)
    return
  }

  const prevRight = prevLeft + prevWidth
  const nextRight = nextLeft + nextWidth
  const forward = nextLeft >= prevLeft

  // 1) 撑开：两端各自向并集方向推 f 比例
  const stretchLeft = prevLeft + (Math.min(prevLeft, nextLeft) - prevLeft) * f
  const stretchRight = prevRight + (Math.max(prevRight, nextRight) - prevRight) * f
  // 2) 收拢：拖尾端多跑 squash 像素（向右时拖尾在左，向左时拖尾在右）
  const sq = Math.max(0, props.squash)
  const settleLeft = forward ? nextLeft - sq : nextLeft
  const settleWidth = nextWidth + sq

  const frames = [
    { left: `${prevLeft}px`, width: `${prevWidth}px`, offset: 0, easing: 'ease-out' },
    {
      left: `${stretchLeft}px`,
      width: `${stretchRight - stretchLeft}px`,
      offset: 0.3,
      easing: 'ease-out',
    },
    { left: `${settleLeft}px`, width: `${settleWidth}px`, offset: 0.55, easing: OVERSHOOT },
    // 3) 回弹落位
    { left: `${nextLeft}px`, width: `${nextWidth}px`, offset: 1, easing: OVERSHOOT },
  ]

  const running = thumb.animate(frames, { duration: T, fill: 'forwards' })
  anim = running
  running.onfinish = () => {
    // 先把最终位置写回内联样式，再撤掉动画，两者数值一致所以不会闪
    left = nextLeft
    width = nextWidth
    thumb.style.transition = 'none'
    thumb.style.left = `${nextLeft}px`
    thumb.style.width = `${nextWidth}px`
    if (anim === running) anim = null
    running.cancel()
  }
}

function selectIndex(index, { rubber = true } = {}) {
  if (props.disabled) return
  const it = normalized.value[index]
  if (!it) return

  const changed = it.value !== current.value
  current.value = it.value
  if (changed) {
    emit('update:modelValue', it.value)
    emit('change', it.value, index)
  }
  if (rubber && changed) rubberTo(index)
  else jumpTo(index, true)
}

// ---------------- 交互 ----------------

/**
 * click 兜底：键盘在 button 上按 Enter/Space 只会派发合成 click，不经过 pointer 事件；
 * 无障碍工具与部分自动化也直接派发 click。拖拽松手后浏览器补发的那次 click 会被吃掉。
 */
function onSlotClick(index) {
  if (swallowClick) {
    swallowClick = false
    return
  }
  selectIndex(index)
}

function onPointerDown(event) {
  if (props.disabled || event.button !== 0) return
  const slot = event.target.closest?.('.rseg__slot')
  drag = {
    startX: event.clientX,
    startLeft: left,
    lastX: event.clientX,
    lastTime: event.timeStamp,
    velocity: 0,
    moved: false,
    tapIndex: slot ? Number(slot.dataset.index) : -1,
  }
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('pointercancel', onPointerUp)
}

function onPointerMove(event) {
  if (!drag) return
  const dx = event.clientX - drag.startX
  if (!drag.moved && Math.abs(dx) < TAP_SLOP) return
  drag.moved = true
  if (!props.draggable) return

  stopAnim()
  const dt = event.timeStamp - drag.lastTime
  if (dt > 0) drag.velocity = ((event.clientX - drag.lastX) / dt) * 1000
  drag.lastX = event.clientX
  drag.lastTime = event.timeStamp

  // 拖拽中拇指贴着指针走，不加过渡；越界由两侧槽位夹住
  const max = Math.max(0, trackEl.value ? trackEl.value.clientWidth - width : 0)
  setThumb(clamp(drag.startLeft + dx, 0, max), width, 0, 'linear')
}

function onPointerUp() {
  removePointerListeners()
  const state = drag
  drag = null
  if (!state) return

  if (!state.moved) {
    if (state.tapIndex >= 0) selectIndex(state.tapIndex)
    return
  }
  if (!props.draggable) return
  swallowClick = true

  // 甩动：把速度折成一小段额外位移，再吸附到最近的槽
  const flick = clamp(state.velocity * 0.12, -props.glide, props.glide)
  const center = left + width / 2 + flick

  let best = 0
  let bestDistance = Infinity
  slotEls.value.forEach((el, i) => {
    if (!el) return
    const distance = Math.abs(el.offsetLeft + el.offsetWidth / 2 - center)
    if (distance < bestDistance) {
      bestDistance = distance
      best = i
    }
  })
  selectIndex(best, { rubber: false })
}

function removePointerListeners() {
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
  window.removeEventListener('pointercancel', onPointerUp)
}

function onKeydown(event) {
  if (props.disabled) return
  const index = normalized.value.findIndex((it) => it.value === current.value)
  let next = index
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = index + 1
  else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = index - 1
  else if (event.key === 'Home') next = 0
  else if (event.key === 'End') next = normalized.value.length - 1
  else return

  event.preventDefault()
  next = clamp(next, 0, normalized.value.length - 1)
  selectIndex(next)
  // 焦点要跟着走，否则方向键第二下就没反应了
  nextTick(() => slotEls.value[next]?.focus())
}

// ---------------- 布局 ----------------

/**
 * 量宽 + 定位。equalSlots 时先取最宽标签统一宽度，再按新宽度重测位置。
 * 槽位数量没变就跳过量宽：那一趟 offsetWidth 会强制 reflow，换页时最贵。
 */
async function syncLayout() {
  const track = trackEl.value
  const slots = slotEls.value
  if (!track || !slots.length) return

  const count = slots.length
  if (props.equalSlots) {
    if (count !== measuredCount) {
      track.style.setProperty('--rseg-slot-w', 'auto')
      await nextTick()
      let widest = 0
      for (const el of slots) {
        if (el) widest = Math.max(widest, el.offsetWidth)
      }
      track.style.setProperty('--rseg-slot-w', `${widest}px`)
      measuredCount = count
      await nextTick()
    }
  } else if (measuredCount !== -1) {
    track.style.setProperty('--rseg-slot-w', 'auto')
    measuredCount = -1
    await nextTick()
  }

  const index = Math.max(
    0,
    normalized.value.findIndex((it) => it.value === current.value),
  )
  jumpTo(index)
}

function initFromModel() {
  const list = normalized.value
  if (!list.length) return
  const hit = list.find((it) => it.value === props.modelValue)
  current.value = hit ? hit.value : list[0].value
}

// 外部改值：直接跳到位，不做橡皮筋动画（区分「自己点」和「别人改」）
watch(
  () => props.modelValue,
  (value) => {
    if (value === undefined || value === current.value) return
    const index = normalized.value.findIndex((it) => it.value === value)
    if (index < 0) return
    current.value = value
    nextTick(() => jumpTo(index))
  },
)

watch(
  () => props.items,
  async () => {
    initFromModel()
    measuredCount = -1
    await nextTick()
    await syncLayout()
  },
)

onMounted(async () => {
  initFromModel()
  await syncLayout()
  // 容器宽度或字体变化都要重新量，否则拇指会跟槽位错位。
  // 必须防抖：换页时页面会连续重排（滚动条出现/消失），逐次量宽会把主线程占满。
  if (typeof ResizeObserver !== 'undefined' && trackEl.value) {
    observer = new ResizeObserver(() => {
      clearTimeout(relayTimer)
      relayTimer = setTimeout(() => syncLayout(), RELAYOUT_DEBOUNCE)
    })
    observer.observe(trackEl.value)
  }
})

onBeforeUnmount(() => {
  clearTimeout(relayTimer)
  stopAnim()
  removePointerListeners()
  observer?.disconnect()
  observer = null
})
</script>

<style lang="scss" scoped>
.rseg {
  position: relative;
  display: inline-flex;
  align-items: center;
  border-radius: var(--rseg-radius);
  background: var(--rseg-track);
  user-select: none;
  // 拖拽拇指时不要连带滚动页面
  touch-action: none;
  // 把重排关在这块里，页面其他内容不跟着重算
  contain: layout style;
}

.rseg__thumb {
  position: absolute;
  top: var(--rseg-inset);
  height: calc(100% - var(--rseg-inset) * 2);
  border-radius: var(--rseg-thumb-radius);
  background: var(--rseg-thumb);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.04);
}

.rseg__slot {
  position: relative;
  z-index: 1;
  flex: 0 0 auto;
  width: var(--rseg-slot-w, auto);
  margin: var(--rseg-inset);
  border: none;
  border-radius: var(--rseg-thumb-radius);
  background: transparent;
  font: inherit;
  white-space: nowrap;
  color: var(--rseg-text, #{$color-text-secondary});
  cursor: pointer;
  // 未选中标签按原组件用 70% 透明度弱化
  opacity: 0.7;
  transition: color 0.18s ease, opacity 0.18s ease;

  &:focus-visible {
    @include focus-ring;
  }

  &.is-active {
    color: var(--rseg-text-active, #{$color-text});
    font-weight: 600;
    opacity: 1;
  }
}

.rseg--sm .rseg__slot {
  padding: 4px 12px;
  font-size: 12px;
}

.rseg--md .rseg__slot {
  padding: 6px 15px;
  font-size: 13px;
}

.rseg--lg .rseg__slot {
  padding: 9px 20px;
  font-size: 14px;
}

.rseg.is-disabled {
  opacity: 0.55;
  pointer-events: none;
}
</style>