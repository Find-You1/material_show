<template>
  <Teleport to="body">
    <div
      class="cinema"
      :class="{ 'cinema--open': opened, 'cinema--closing': closing }"
      :style="stageStyle"
      role="dialog"
      aria-modal="true"
      :aria-label="frame.title || 'Featured frame'"
    >
      <!-- 黑底：入场即压黑，做一次硬切；关闭时淡出，露出背后的山路 -->
      <div class="cinema__backdrop" aria-hidden="true"></div>

      <!-- 从被点的那块画框长出来：clip-path 由画框屏幕矩形扩到满屏 -->
      <div class="cinema__stage" aria-hidden="true">
        <!-- 铺底：同一张照片铺满屏幕后重度虚化压暗，只负责托住四周留白 -->
        <img class="cinema__plate" :src="frame.image" alt="" decoding="async" />
        <!-- 主体：contain 居中，保持照片原始比例，不裁切不放大 -->
        <img
          class="cinema__img"
          :src="frame.image"
          :alt="frame.title || 'Featured frame'"
          decoding="async"
        />
        <div class="cinema__scrim"></div>
      </div>

      <!-- 切镜瞬间的一道白光，像放映机换本 -->
      <div class="cinema__flash" aria-hidden="true"></div>
      <div class="cinema__grain" aria-hidden="true"></div>

      <header class="cinema__bar">
        <span class="cinema__brand">Lumen</span>
        <button ref="closeBtn" class="cinema__close" type="button" aria-label="Close" @click="close">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path
              d="M6 6l12 12M18 6L6 18"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linecap="round"
            />
          </svg>
        </button>
      </header>

      <div class="cinema__copy">
        <p class="cinema__eyebrow">Selected frame</p>
        <h2 class="cinema__title">{{ frame.title || 'Untitled frame' }}</h2>
        <p v-if="frame.owner && frame.owner.username" class="cinema__meta">
          by {{ frame.owner.username }}
        </p>
        <div class="cinema__actions">
          <router-link :to="{ name: 'photo', params: { id: frame.id } }" class="cinema__btn">
            Open full page
          </router-link>
          <button type="button" class="cinema__btn cinema__btn--ghost" @click="close">
            Back to the road
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
/**
 * 放映层：点击路边画框后的「高级转场」。
 *
 * 两段式，全部由一次 CSS 过渡完成：
 * 1) 硬切到黑 + 一道白光（放映机换本）；
 * 2) 画面从被点画框的屏幕矩形，用 clip-path 长到满屏，同时从虚焦暗场
 *    收敛到清晰；文字在画面基本铺满后错峰上浮。
 *
 * 关闭是反过来的：黑底先淡掉，画面缩回原画框位置，然后卸载。
 * 所以整个过程始终看着「同一块画框」，不会出现凭空淡入的陌生画面。
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'

const props = defineProps({
  frame: { type: Object, required: true },
  origin: { type: Object, default: null },
})

const emit = defineEmits(['close'])

const closeBtn = ref(null)
const opened = ref(false)
const closing = ref(false)
const stageStyle = ref({})

let closeTimer = 0
let prevOverflow = ''
let reduced = false

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v
}

function originInset() {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const r = props.origin
  if (!r || !r.w || !r.h) {
    // 没有来源矩形时，从画面中心一小块长出来，别直接满屏闪
    return `inset(${Math.round(vh * 0.34)}px ${Math.round(vw * 0.34)}px ${Math.round(
      vh * 0.34,
    )}px ${Math.round(vw * 0.34)}px)`
  }
  const x = clamp(r.x, 0, Math.max(0, vw - 1))
  const y = clamp(r.y, 0, Math.max(0, vh - 1))
  const w = clamp(r.w, 1, vw - x)
  const h = clamp(r.h, 1, vh - y)
  return `inset(${Math.round(y)}px ${Math.round(vw - x - w)}px ${Math.round(
    vh - y - h,
  )}px ${Math.round(x)}px)`
}

function close() {
  if (closing.value) return
  closing.value = true
  closeTimer = window.setTimeout(() => emit('close'), reduced ? 60 : 660)
}

function onKeydown(event) {
  if (event.key === 'Escape') {
    event.preventDefault()
    close()
  }
}

onMounted(() => {
  reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  stageStyle.value = { '--origin-clip': originInset() }

  prevOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'
  window.addEventListener('keydown', onKeydown)

  // 先让浏览器认下初始裁切，再切到满屏，过渡才会真的跑
  requestAnimationFrame(() => requestAnimationFrame(() => {
    opened.value = true
  }))

  requestAnimationFrame(() => closeBtn.value?.focus())
})

onBeforeUnmount(() => {
  clearTimeout(closeTimer)
  document.body.style.overflow = prevOverflow
  window.removeEventListener('keydown', onKeydown)
})
</script>

<style lang="scss" scoped>
.cinema {
  position: fixed;
  inset: 0;
  z-index: $z-overlay;
  overflow: hidden;
  color: $color-text-on-dark;
  isolation: isolate;
}

.cinema__backdrop {
  position: absolute;
  inset: 0;
  background: #000;
  opacity: 1;
  transition: opacity 0.5s ease 0.08s;
}

.cinema--closing .cinema__backdrop {
  opacity: 0;
}

.cinema__stage {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  // 四周留一圈边，满幅照片也有一条黑框兜住，画面不贴屏幕边
  padding: clamp(16px, 3.2vw, 44px);
  // 初始是画框的屏幕矩形，opened 后过渡到满屏
  clip-path: var(--origin-clip, inset(0 0 0 0));
  transition: clip-path 0.95s cubic-bezier(0.16, 1, 0.3, 1);
  will-change: clip-path;
}

.cinema--open .cinema__stage {
  clip-path: inset(0 0 0 0);
}

// 铺底照：cover 满屏 + 重度虚化，把 contain 留下的两侧/上下留白填成照片的延伸
.cinema__plate {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  filter: blur(46px) brightness(0.38) saturate(0.92);
  transform: scale(1.08);
  pointer-events: none;
}

.cinema--open .cinema__plate {
  animation: cinema-drift 18s ease-out 1.6s both;
}

// 主体照：只按原始比例缩放到可见区域内（contain），不做任何裁切与放大
.cinema__img {
  position: relative;
  z-index: 1;
  width: auto;
  height: auto;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  // 从虚焦暗场收敛到清晰；主体不做缩放，尺寸始终等于照片原始比例
  filter: brightness(0.42) blur(12px);
  transition: filter 1.1s ease;
}

.cinema--open .cinema__img {
  filter: brightness(0.98) blur(0);
}

.cinema__scrim {
  position: absolute;
  inset: 0;
  z-index: 2;
  // 只压上下两端：中间照片区域保持原色，标题与工具条才有落点
  background: linear-gradient(
    180deg,
    rgba(0, 0, 0, 0.42) 0%,
    rgba(0, 0, 0, 0) 18%,
    rgba(0, 0, 0, 0) 58%,
    rgba(0, 0, 0, 0.86) 100%
  );
  opacity: 0;
  transition: opacity 1s ease 0.35s;
}

.cinema--open .cinema__scrim {
  opacity: 1;
}

.cinema__flash {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: #ffffff;
  opacity: 0;
  animation: cinema-flash 0.62s ease-out both;
}

.cinema__grain {
  position: absolute;
  inset: -40%;
  pointer-events: none;
  opacity: 0.13;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='180' height='180' filter='url(%23n)'/%3E%3C/svg%3E");
  background-size: 180px 180px;
  mix-blend-mode: overlay;
  animation: cinema-grain 0.36s steps(2, end) infinite;
}

.cinema__bar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 3;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 24px;
  opacity: 0;
  transform: translateY(-8px);
  transition: opacity 0.7s ease, transform 0.7s ease;

  .cinema--open & {
    opacity: 1;
    transform: none;
    transition-delay: 0.3s;
  }
}

.cinema__brand {
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: rgba(245, 245, 247, 0.8);
}

.cinema__close {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border-radius: 50%;
  color: rgba(245, 245, 247, 0.9);
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.24);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  cursor: pointer;
  transition: background 0.2s ease, color 0.2s ease, transform 0.2s ease;

  &:hover {
    color: #000;
    background: rgba(255, 255, 255, 0.92);
  }

  &:active {
    transform: scale(0.94);
  }
}

.cinema__copy {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 3;
  max-width: 780px;
  padding: 0 40px 9vh;
  transition: opacity 0.28s ease;

  > * {
    opacity: 0;
    transform: translateY(28px);
    transition: opacity 0.9s cubic-bezier(0.16, 1, 0.3, 1),
      transform 0.9s cubic-bezier(0.16, 1, 0.3, 1);
  }
}

.cinema--open .cinema__copy > * {
  opacity: 1;
  transform: none;
}

.cinema--open .cinema__eyebrow {
  transition-delay: 0.52s;
}

.cinema--open .cinema__title {
  transition-delay: 0.66s;
}

.cinema--open .cinema__meta {
  transition-delay: 0.82s;
}

.cinema--open .cinema__actions {
  transition-delay: 0.96s;
}

.cinema--closing .cinema__copy {
  opacity: 0;
}

.cinema__eyebrow {
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.34em;
  text-transform: uppercase;
  color: rgba(245, 245, 247, 0.55);
}

.cinema__title {
  margin-top: 16px;
  font-size: clamp(34px, 5.2vw, 74px);
  font-weight: 600;
  line-height: 0.98;
  letter-spacing: -0.045em;
  color: #fff;
}

.cinema__meta {
  margin-top: 16px;
  font-size: 14px;
  letter-spacing: 0.02em;
  color: $color-text-on-dark-soft;
}

.cinema__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 28px;
}

.cinema__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 13px 28px;
  border-radius: 980px;
  font-size: 15px;
  font-weight: 500;
  font-family: inherit;
  color: #0a0a0a;
  background: #f5f5f7;
  border: 1px solid transparent;
  cursor: pointer;
  transition: background 0.2s ease, transform 0.2s ease, border-color 0.2s ease;

  &:hover {
    color: #000;
    background: #fff;
    transform: translateY(-1px);
  }
}

.cinema__btn--ghost {
  color: $color-text-on-dark;
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.26);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);

  &:hover {
    color: #fff;
    background: rgba(255, 255, 255, 0.16);
    border-color: rgba(255, 255, 255, 0.42);
  }
}

@keyframes cinema-flash {
  0% {
    opacity: 0.42;
  }
  18% {
    opacity: 0.12;
  }
  100% {
    opacity: 0;
  }
}

@keyframes cinema-drift {
  from {
    transform: scale(1.08);
  }
  to {
    transform: scale(1.14);
  }
}

// 极轻的颗粒抖动，模拟放映机
@keyframes cinema-grain {
  0% {
    transform: translate3d(0, 0, 0);
  }
  50% {
    transform: translate3d(-2px, 1px, 0);
  }
  100% {
    transform: translate3d(2px, -1px, 0);
  }
}

@media (max-width: 640px) {
  .cinema__copy {
    padding: 0 24px 7vh;
  }

  .cinema__actions {
    margin-top: 22px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .cinema__stage,
  .cinema__img,
  .cinema__scrim,
  .cinema__bar,
  .cinema__copy,
  .cinema__copy > * {
    transition: none;
  }

  .cinema__plate,
  .cinema__grain,
  .cinema__flash {
    animation: none;
  }

  .cinema__img {
    filter: none;
  }

  .cinema__copy > * {
    opacity: 1;
    transform: none;
  }
}
</style>
