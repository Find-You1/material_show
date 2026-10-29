<template>
  <div
    ref="rootEl"
    class="gsel"
    :class="[`gsel--${size}`, { 'is-block': block, 'is-open': open, 'is-disabled': disabled }]"
    :style="cssVars"
  >
    <div
      ref="triggerEl"
      class="gsel__trigger"
      role="combobox"
      :tabindex="disabled ? -1 : 0"
      :aria-expanded="open"
      :aria-haspopup="'listbox'"
      :aria-label="ariaLabel"
      @click="toggle"
      @keydown="onTriggerKeydown"
    >
      <span class="gsel__value" :class="{ 'is-placeholder': !selected }">{{ displayLabel }}</span>

      <button
        v-if="clearable && hasValue"
        type="button"
        class="gsel__clear"
        aria-label="Clear"
        @click.stop="clear"
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M4 4l8 8M12 4l-8 8" />
        </svg>
      </button>

      <svg v-if="showChevron" class="gsel__chevron" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M4 6l4 4 4-4" />
      </svg>
    </div>

    <Teleport to="body">
      <Transition name="gsel-pop">
        <div
          v-if="open"
          ref="menuEl"
          class="gsel__menu"
          :style="menuStyle"
          role="listbox"
          @pointerleave="onMenuLeave"
        >
          <div class="gsel__pill" :style="pillStyle" aria-hidden="true" />

          <button
            v-for="(opt, i) in opts"
            :key="opt.value"
            ref="rowEls"
            type="button"
            class="gsel__row"
            :class="{ 'is-selected': opt.value === modelValue, 'is-hover': i === hoverIndex }"
            role="option"
            :aria-selected="opt.value === modelValue"
            @pointerenter="onRowEnter(i)"
            @click="pick(i)"
          >
            <span class="gsel__row-label">{{ opt.label }}</span>
            <span v-if="opt.tag" class="gsel__tag">{{ opt.tag }}</span>
            <svg v-if="showCheck && opt.value === modelValue" class="gsel__check" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M3.5 8.5l3 3 6-7" />
            </svg>
          </button>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup>
/**
 * 滑行高亮下拉（移植自 reactbits 的 Glide Select）。
 *
 * 与 el-select 的差别就在「高亮是一条会滑行的药丸」：
 *   - 指针移到哪一行，药丸就以 glideDuration 滑过去，而不是瞬间跳
 *   - 选中行静止时药丸停在它上面（行本身不填色），选中感靠字重 + 强调色
 *   - rememberPosition 为真时，指针离开菜单药丸停在最后停留行，
 *     下次再进来会从那行继续滑，而不是从选中行重来
 *
 * 无第三方依赖：药丸用 top/height 的 CSS transition，图标用内联 SVG。
 * 菜单 teleport 到 body 并走 fixed 定位，避免被表格/面板的 overflow 裁掉。
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

const props = defineProps({
  /** string[] | { value, label, tag?, disabled? }[] */
  options: { type: Array, default: () => [] },
  modelValue: { type: [String, Number, Boolean], default: '' },
  placeholder: { type: String, default: 'Select' },
  /** sm | md | lg */
  size: { type: String, default: 'md' },
  radius: { type: Number, default: 10 },
  /** 0 = 跟随触发器宽度 */
  menuWidth: { type: Number, default: 0 },
  /** top | bottom，空间不够会自动翻转 */
  placement: { type: String, default: 'bottom' },
  /** left | right，菜单与触发器的对齐边 */
  align: { type: String, default: 'left' },
  popDuration: { type: Number, default: 180 },
  glideDuration: { type: Number, default: 220 },
  rememberPosition: { type: Boolean, default: true },
  showTags: { type: Boolean, default: true },
  /** 选中行右侧的对勾，默认关闭（本站偏好无图标） */
  showCheck: { type: Boolean, default: false },
  showChevron: { type: Boolean, default: true },
  /** 允许清空回空值（对应原来的「不过滤」） */
  clearable: { type: Boolean, default: false },
  /** 撑满父容器宽度 */
  block: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  ariaLabel: { type: String, default: 'Select' },
  // 颜色默认值按本站 Apple 浅色主题调好
  accentColor: { type: String, default: '#0071e3' },
  surfaceColor: { type: String, default: '#ffffff' },
  highlightColor: { type: String, default: '#f5f5f7' },
  textColor: { type: String, default: '#1d1d1f' },
})

const emit = defineEmits(['update:modelValue', 'change', 'clear'])

const rootEl = ref(null)
const triggerEl = ref(null)
const menuEl = ref(null)
const rowEls = ref([])

const open = ref(false)
const hoverIndex = ref(0)
const lastHover = ref(-1)
const pillTop = ref(0)
const pillHeight = ref(0)
const pillAnim = ref(false)
const menuPos = ref({ top: '0px', left: '0px', width: '0px' })
const menuReady = ref(false)

const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)'

const opts = computed(() =>
  (props.options || []).map((o) =>
    typeof o === 'string' ? { value: o, label: o, tag: '', disabled: false } : { ...o, tag: o.tag || '' },
  ),
)

const selected = computed(() => opts.value.find((o) => o.value === props.modelValue) || null)
const displayLabel = computed(() => selected.value?.label ?? props.placeholder)
const hasValue = computed(() => props.modelValue !== '' && props.modelValue !== undefined && props.modelValue !== null)

const cssVars = computed(() => ({
  '--gsel-accent': props.accentColor,
  '--gsel-surface': props.surfaceColor,
  '--gsel-highlight': props.highlightColor,
  '--gsel-text': props.textColor,
  '--gsel-radius': `${props.radius}px`,
  '--gsel-item-radius': `${Math.max(0, props.radius - 4)}px`,
  '--gsel-pop': `${props.popDuration}ms`,
}))

const menuStyle = computed(() => ({
  // 菜单被 teleport 到 body，已经不在 .gsel 子树里，拿不到根节点上的自定义属性，
  // 所以这些颜色/圆角变量必须再挂一份到菜单自己身上。
  ...cssVars.value,
  top: menuPos.value.top,
  left: menuPos.value.left,
  width: menuPos.value.width,
  visibility: menuReady.value ? 'visible' : 'hidden',
}))

// 药丸只做 translateY：行高是定值，用 transform 走合成层比动 top 顺得多
const pillStyle = computed(() => ({
  transform: `translateY(${pillTop.value}px)`,
  height: `${pillHeight.value}px`,
  transition: pillAnim.value ? `transform ${props.glideDuration}ms ${EASE}` : 'none',
}))

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v))
}

function selectedIndex() {
  return opts.value.findIndex((o) => o.value === props.modelValue)
}

/** 把药丸挪到第 i 行；animate=false 用于首次落位（不要从 0 滑过去） */
function movePill(i, animate = true) {
  const el = rowEls.value[i]
  if (!el) return
  pillAnim.value = animate
  pillTop.value = el.offsetTop
  pillHeight.value = el.offsetHeight
}

function initialPillIndex() {
  if (props.rememberPosition && lastHover.value >= 0 && lastHover.value < opts.value.length) {
    return lastHover.value
  }
  const i = selectedIndex()
  return i >= 0 ? i : 0
}

function measure() {
  const trigger = triggerEl.value
  const menu = menuEl.value
  if (!trigger) return
  const t = trigger.getBoundingClientRect()
  const width = props.menuWidth || t.width
  const menuH = menu?.offsetHeight || 0
  const spaceBelow = window.innerHeight - t.bottom
  const spaceAbove = t.top

  let place = props.placement
  if (menuH) {
    if (place === 'bottom' && spaceBelow < menuH + 8 && spaceAbove > spaceBelow) place = 'top'
    else if (place === 'top' && spaceAbove < menuH + 8 && spaceBelow > spaceAbove) place = 'bottom'
  }

  let left = props.align === 'right' ? t.right - width : t.left
  left = clamp(left, 8, Math.max(8, window.innerWidth - width - 8))
  const top = place === 'top' ? t.top - menuH - 6 : t.bottom + 6

  menuPos.value = { top: `${top}px`, left: `${left}px`, width: `${width}px` }
}

async function openMenu() {
  if (props.disabled || open.value) return
  open.value = true
  menuReady.value = false
  await nextTick()
  measure()
  const i = initialPillIndex()
  hoverIndex.value = i
  movePill(i, false)
  // 下一帧再开过渡，避免首次落位被动画夹带
  requestAnimationFrame(() => {
    pillAnim.value = true
    menuReady.value = true
  })
  window.addEventListener('pointerdown', onDocPointerDown, true)
  window.addEventListener('scroll', onViewportChange, true)
  window.addEventListener('resize', onViewportChange)
}

function closeMenu() {
  if (!open.value) return
  open.value = false
  menuReady.value = false
  window.removeEventListener('pointerdown', onDocPointerDown, true)
  window.removeEventListener('scroll', onViewportChange, true)
  window.removeEventListener('resize', onViewportChange)
}

function toggle() {
  if (open.value) closeMenu()
  else openMenu()
}

function onDocPointerDown(event) {
  const target = event.target
  if (rootEl.value?.contains(target)) return
  if (menuEl.value?.contains(target)) return
  closeMenu()
}

function onViewportChange() {
  if (open.value) measure()
}

function onRowEnter(i) {
  hoverIndex.value = i
  lastHover.value = i
  movePill(i)
}

function onMenuLeave() {
  // 记住位置：药丸留在最后停留行；否则回到选中行
  if (props.rememberPosition) return
  const i = selectedIndex()
  hoverIndex.value = i >= 0 ? i : 0
  movePill(hoverIndex.value)
}

function pick(i) {
  const opt = opts.value[i]
  if (!opt || opt.disabled) return
  hoverIndex.value = i
  lastHover.value = i
  emit('update:modelValue', opt.value)
  emit('change', opt.value, opt)
  closeMenu()
}

function clear() {
  emit('update:modelValue', '')
  emit('change', '', null)
  emit('clear')
  closeMenu()
}

function onTriggerKeydown(event) {
  if (props.disabled) return
  const key = event.key
  if (!open.value) {
    if (key === 'ArrowDown' || key === 'ArrowUp' || key === 'Enter' || key === ' ') {
      event.preventDefault()
      openMenu()
    }
    return
  }

  if (key === 'Escape') {
    event.preventDefault()
    closeMenu()
    return
  }
  if (key === 'ArrowDown' || key === 'ArrowUp') {
    event.preventDefault()
    const dir = key === 'ArrowDown' ? 1 : -1
    hoverIndex.value = clamp(hoverIndex.value + dir, 0, opts.value.length - 1)
    lastHover.value = hoverIndex.value
    movePill(hoverIndex.value)
    rowEls.value[hoverIndex.value]?.scrollIntoView({ block: 'nearest' })
    return
  }
  if (key === 'Home' || key === 'End') {
    event.preventDefault()
    hoverIndex.value = key === 'Home' ? 0 : opts.value.length - 1
    lastHover.value = hoverIndex.value
    movePill(hoverIndex.value)
    rowEls.value[hoverIndex.value]?.scrollIntoView({ block: 'nearest' })
    return
  }
  if (key === 'Enter') {
    event.preventDefault()
    pick(hoverIndex.value)
  }
}

// 外部改值时，若菜单开着同步药丸位置
watch(
  () => props.modelValue,
  () => {
    if (!open.value || props.rememberPosition) return
    const i = selectedIndex()
    hoverIndex.value = i >= 0 ? i : 0
    movePill(hoverIndex.value)
  },
)

onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', onDocPointerDown, true)
  window.removeEventListener('scroll', onViewportChange, true)
  window.removeEventListener('resize', onViewportChange)
})
</script>

<style lang="scss" scoped>
.gsel {
  position: relative;
  display: inline-block;
  vertical-align: middle;
}

.gsel.is-block {
  display: block;
}

/* ---------- 触发器 ---------- */
.gsel__trigger {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  height: var(--gsel-h);
  padding: 0 10px;
  border: 1px solid $color-border;
  border-radius: var(--gsel-radius);
  background: $color-bg-card;
  font-size: var(--gsel-fs);
  color: var(--gsel-text);
  cursor: pointer;
  transition: border-color 0.18s ease, box-shadow 0.18s ease;

  &:hover {
    border-color: $color-border-strong;
  }

  &:focus-visible {
    @include focus-ring;
  }
}

.gsel.is-open .gsel__trigger {
  border-color: var(--gsel-accent);
  box-shadow: 0 0 0 3px rgba(0, 113, 227, 0.16);
}

.gsel.is-disabled {
  opacity: 0.6;
  pointer-events: none;
}

.gsel__value {
  flex: 1 1 auto;
  min-width: 0;
  text-align: left;
  @include ellipsis;

  &.is-placeholder {
    color: $color-text-muted;
  }
}

.gsel__chevron {
  flex: none;
  width: 14px;
  height: 14px;
  fill: none;
  stroke: $color-text-muted;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
  transition: transform 0.22s ease;
}

.gsel.is-open .gsel__chevron {
  transform: rotate(180deg);
}

.gsel__clear {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: $color-bg-sunken;
  cursor: pointer;
  transition: background 0.18s ease;

  svg {
    width: 10px;
    height: 10px;
    fill: none;
    stroke: $color-text-secondary;
    stroke-width: 1.8;
    stroke-linecap: round;
  }

  &:hover {
    background: $color-border-strong;
  }
}

/* ---------- 尺寸档 ---------- */
.gsel--sm {
  --gsel-h: 28px;
  --gsel-fs: 12px;
}

.gsel--md {
  --gsel-h: 34px;
  --gsel-fs: 13px;
}

.gsel--lg {
  --gsel-h: 40px;
  --gsel-fs: 14px;
}

/* ---------- 菜单 ---------- */
.gsel__menu {
  position: fixed;
  z-index: 2200;
  contain: layout style;
  max-height: 268px;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 4px;
  background: var(--gsel-surface);
  border: 1px solid $color-border;
  border-radius: var(--gsel-radius);
  box-shadow: $shadow-pop;
}

.gsel__pill {
  position: absolute;
  top: 0;
  left: 4px;
  right: 4px;
  border-radius: var(--gsel-item-radius);
  background: var(--gsel-highlight);
  pointer-events: none;
  will-change: transform;
}

.gsel__row {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 10px;
  border: none;
  border-radius: var(--gsel-item-radius);
  background: transparent;
  font: inherit;
  font-size: 13px;
  color: var(--gsel-text);
  text-align: left;
  cursor: pointer;

  &:focus-visible {
    @include focus-ring;
  }

  &.is-selected {
    color: var(--gsel-accent);
    font-weight: 600;
  }
}

.gsel__row-label {
  flex: 1 1 auto;
  min-width: 0;
  @include ellipsis;
}

.gsel__tag {
  flex: none;
  padding: 1px 6px;
  border-radius: 999px;
  background: $color-bg-sunken;
  font-size: 11px;
  font-weight: 400;
  color: $color-text-secondary;
}

.gsel__check {
  flex: none;
  width: 14px;
  height: 14px;
  fill: none;
  stroke: var(--gsel-accent);
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* ---------- 弹层动画 ---------- */
.gsel-pop-enter-active,
.gsel-pop-leave-active {
  transition: opacity var(--gsel-pop) ease, transform var(--gsel-pop) ease;
}

.gsel-pop-enter-from,
.gsel-pop-leave-to {
  opacity: 0;
  transform: scale(0.97);
}
</style>