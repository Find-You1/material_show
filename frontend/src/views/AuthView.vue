<template>
  <div class="auth" @pointermove="onPointerMove" @pointerleave="resetTilt">
    <AuthBackdrop ref="backdropRef" :mode="mode" />

    <!-- 电影黑边：切换的那一下收进来，等新卡片往回飞时再退回去 -->
    <div class="auth__bars" :class="{ 'is-live': flying === 'out' || flying === 'pre' }" aria-hidden="true">
      <span class="auth__bar auth__bar--top"></span>
      <span class="auth__bar auth__bar--bottom"></span>
    </div>

    <div class="auth__frame">
      <!-- 卡片本体负责「飞」：切模式时先飞出画面，换完内容再从另一侧飞回来。
           拖动时它跟着指针走，松手过阈值就直接甩出去换另一张表单 -->
      <div
        ref="cardRef"
        class="auth__card"
        :class="[`auth__card--${mode}`, flightClass, { 'is-dragging': drag.engaged }]"
        :style="cardStyle"
        @pointerdown="onCardDown"
        @pointermove="onCardMove"
        @pointerup="onCardUp"
        @pointercancel="onCardUp"
        @wheel="onWheel"
      >
        <!-- 内层负责指针视差：外壳的 transform 留给飞行，两个动画不会互相覆盖 -->
        <div class="auth__surface" :style="tiltStyle">
          <!-- 左：剧照。切模式时两张照片交叉淡入，文案跟着换 -->
          <aside class="auth__visual" aria-hidden="true">
            <div class="auth__shot auth__shot--login" :class="{ 'is-out': mode === 'register' }"></div>
            <div class="auth__shot auth__shot--register" :class="{ 'is-in': mode === 'register' }"></div>

            <div class="auth__visual-body">
              <div class="auth__visual-brand">Lumen</div>
              <Transition name="quote" mode="out-in">
                <p :key="mode" class="auth__visual-quote">
                  {{ mode === 'login' ? 'Find your next inspiration' : 'Share what you see' }}
                </p>
              </Transition>
            </div>
          </aside>

          <section class="auth__panel">
            <!-- 主要的切换入口是手势（拖动卡片 / 触控板横滑）；
                 这行文字留给键盘与读屏用户，不是唯一入口 -->
            <header class="auth__head">
              <span class="auth__eyebrow">Lumen account</span>
              <button
                type="button"
                class="auth__other"
                :disabled="Boolean(flying)"
                @click="switchMode(mode === 'login' ? 'register' : 'login')"
              >
                {{ mode === 'login' ? 'Create account' : 'Sign in' }}
                <span class="auth__other-arrow" aria-hidden="true">→</span>
              </button>
            </header>

            <!-- 两个表单叠在同一格里：高度在切换时做一次缓动，卡片不会突然抽高 -->
            <div class="auth__stage" :style="stageStyle">
              <div
                ref="loginPane"
                class="auth__pane"
                :class="{ 'is-active': mode === 'login' }"
                :aria-hidden="mode !== 'login'"
                :inert="mode !== 'login'"
              >
                <h1 class="auth__title auth__rise" style="--d: 0">Welcome back</h1>
                <p class="auth__desc auth__rise" style="--d: 1">
                  Sign in to save images, upload your work, and manage your content
                </p>

                <el-form
                  ref="loginFormRef"
                  :model="loginForm"
                  :rules="loginRules"
                  label-position="top"
                  class="auth__form"
                  @submit.prevent="submitLogin"
                >
                  <el-form-item label="Username or email" prop="account" class="auth__rise" style="--d: 2">
                    <el-input
                      v-model="loginForm.account"
                      placeholder="Enter your username or email"
                      autocomplete="username"
                    />
                  </el-form-item>

                  <el-form-item label="Password" prop="password" class="auth__rise" style="--d: 3">
                    <el-input
                      v-model="loginForm.password"
                      type="password"
                      placeholder="Enter your password"
                      show-password
                      autocomplete="current-password"
                      @keyup.enter="submitLogin"
                    />
                  </el-form-item>

                  <el-button
                    type="primary"
                    class="auth__submit auth__rise"
                    style="--d: 4"
                    :loading="loading"
                    @click="submitLogin"
                  >
                    Sign in
                  </el-button>
                </el-form>

                <div class="auth__foot auth__rise" style="--d: 5">
                  Don't have an account?
                  <button type="button" class="auth__link" @click="switchMode('register')">Sign up</button>
                </div>
              </div>

              <div
                ref="registerPane"
                class="auth__pane"
                :class="{ 'is-active': mode === 'register' }"
                :aria-hidden="mode !== 'register'"
                :inert="mode !== 'register'"
              >
                <h1 class="auth__title auth__rise" style="--d: 0">Create your account</h1>
                <p class="auth__desc auth__rise" style="--d: 1">
                  Upload your work right away. Once approved, it appears in the public gallery for everyone.
                </p>

                <el-form
                  ref="registerFormRef"
                  :model="registerForm"
                  :rules="registerRules"
                  label-position="top"
                  class="auth__form"
                  @submit.prevent="submitRegister"
                >
                  <el-form-item label="Username" prop="username" class="auth__rise" style="--d: 2">
                    <el-input
                      v-model="registerForm.username"
                      placeholder="3 to 50 characters. Letters, numbers, and underscores"
                    />
                  </el-form-item>

                  <el-form-item label="Email" prop="email" class="auth__rise" style="--d: 3">
                    <el-input v-model="registerForm.email" placeholder="Used for sign-in and account recovery" />
                  </el-form-item>

                  <el-form-item label="Nickname (optional)" prop="nickname" class="auth__rise" style="--d: 4">
                    <el-input v-model="registerForm.nickname" placeholder="Defaults to your username" />
                  </el-form-item>

                  <div class="auth__row auth__rise" style="--d: 5">
                    <el-form-item label="Password" prop="password">
                      <el-input
                        v-model="registerForm.password"
                        type="password"
                        placeholder="6 to 24 characters"
                        show-password
                        autocomplete="new-password"
                      />
                    </el-form-item>

                    <el-form-item label="Confirm password" prop="confirm">
                      <el-input
                        v-model="registerForm.confirm"
                        type="password"
                        placeholder="Enter it again"
                        show-password
                        autocomplete="new-password"
                        @keyup.enter="submitRegister"
                      />
                    </el-form-item>
                  </div>

                  <!-- 密码强度：随输入实时变化的三格条，注册时唯一需要「当场判断」的信息 -->
                  <Transition name="hint">
                    <div v-if="registerForm.password" class="auth__strength" :data-score="strength">
                      <span class="auth__strength-bars"><i></i><i></i><i></i></span>
                      <span class="auth__strength-label">{{ strengthLabel }}</span>
                    </div>
                  </Transition>

                  <el-button
                    type="primary"
                    class="auth__submit auth__rise"
                    style="--d: 6"
                    :loading="loading"
                    @click="submitRegister"
                  >
                    Create account
                  </el-button>
                </el-form>

                <div class="auth__foot auth__rise" style="--d: 7">
                  Already have an account?
                  <button type="button" class="auth__link" @click="switchMode('login')">Sign in</button>
                </div>
              </div>
            </div>
          </section>

          <!-- 入场时从卡片上扫过的一道白光 -->
          <span class="auth__sheen" :class="{ 'is-sweeping': flying === 'in' }" aria-hidden="true"></span>
        </div>
      </div>

      <!-- 手势提示：切换不是点按钮，是把卡片左右拖出去 -->
      <p class="auth__hint" aria-hidden="true">Drag the card left or right to switch</p>
    </div>
  </div>
</template>

<script setup>
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
} from 'vue'
import { useRoute, useRouter } from 'vue-router'

import AuthBackdrop from '@/components/auth/AuthBackdrop.vue'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

// 登录与注册是同一个页面的两种状态：URL 仍然可分享（/login、/register），
// 但切换时组件不重建，这样才有空间做飞行动画与内容交叉淡入
const mode = ref(route.name === 'register' ? 'register' : 'login')

// 飞行状态：'out' 飞出 → 'pre' 换内容（隐身）→ 'in' 从另一侧飞回
const flying = ref(null)
const FLY = { out: 520, in: 940 }

const loginFormRef = ref(null)
const registerFormRef = ref(null)
const loginPane = ref(null)
const registerPane = ref(null)
const cardRef = ref(null)
const backdropRef = ref(null)
const stageHeight = ref(null)
const loading = ref(false)

const reduced =
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

const tilt = reactive({ x: 0, y: 0 })
const tiltStyle = computed(() => ({
  transform: `rotateX(${tilt.x.toFixed(2)}deg) rotateY(${tilt.y.toFixed(2)}deg)`,
}))

// 登录从左边进、注册从右边进 —— 与直升机两个相反的绕场方向对上
const dir = computed(() => (mode.value === 'login' ? -1 : 1))

const flightClass = computed(() => ({
  'is-out': flying.value === 'out',
  'is-pre': flying.value === 'pre',
  'is-in': flying.value === 'in',
}))

// 切卡是手势，不是按钮：按住卡片左右拖，跟手走；
// 松手时位移过阈值（或甩得够快）就把这张甩出去、换另一张从那侧飞回来。
// 方向跟着手走 —— 往左拖就从左边退场，往右拖就从右边退场
const drag = reactive({
  active: false,
  engaged: false,
  id: null,
  startX: 0,
  startY: 0,
  dx: 0,
  lastX: 0,
  lastT: 0,
  vx: 0,
})
const swipeDir = ref(0)
const DRAG = { threshold: 96, flick: 0.62, max: 460 }

const cardStyle = computed(() => {
  const style = {}
  if (drag.dx) {
    style['--drag-x'] = `${drag.dx}px`
    style['--drag-rot'] = `${(-drag.dx / 28).toFixed(2)}deg`
    style['--drag-scale'] = String(1 - Math.min(Math.abs(drag.dx), DRAG.max) / 10000)
  }
  // 甩出去的那一下沿用拖动方向；进了隐身帧就交还给模式自己的方向
  if (flying.value === 'out' && swipeDir.value) style['--dir'] = String(swipeDir.value)
  return style
})

function onCardDown(event) {
  if (flying.value || reduced || event.button > 0) return
  // 表单控件、按钮、链接上按下不接管：那是输入和点击
  if (event.target.closest?.('input, textarea, select, button, a, label')) return

  drag.active = true
  drag.engaged = false
  drag.id = event.pointerId
  drag.startX = event.clientX
  drag.startY = event.clientY
  drag.lastX = event.clientX
  drag.lastT = performance.now()
  drag.vx = 0
  drag.dx = 0
  event.currentTarget.setPointerCapture?.(event.pointerId)
}

function onCardMove(event) {
  if (!drag.active || event.pointerId !== drag.id) return
  const dx = event.clientX - drag.startX
  const dy = event.clientY - drag.startY

  if (!drag.engaged) {
    if (Math.abs(dx) < 8) return
    // 纵向更明显就放行：那是选文字或页面滚动，不是切卡
    if (Math.abs(dx) < Math.abs(dy) * 1.25) {
      drag.active = false
      return
    }
    drag.engaged = true
    resetTilt()
  }

  const now = performance.now()
  drag.vx = (event.clientX - drag.lastX) / Math.max(1, now - drag.lastT)
  drag.lastX = event.clientX
  drag.lastT = now

  // 橡胶带：拖过一定距离后变沉，但始终跟手，不会拖出屏幕还停不下来
  const over = Math.max(0, Math.abs(dx) - DRAG.max)
  drag.dx = Math.sign(dx) * (Math.min(Math.abs(dx), DRAG.max) + over * 0.22)
  // 直升机跟着卡片一起挪：停靠感来自「它和表单是同一个东西」
  backdropRef.value?.setCardDrag(drag.dx)
  event.preventDefault()
}

function onCardUp(event) {
  if (!drag.active || event.pointerId !== drag.id) return
  drag.active = false
  drag.id = null

  const dx = drag.dx
  const engaged = drag.engaged
  const flick = Math.abs(drag.vx) > DRAG.flick && Math.abs(dx) > 34
  drag.engaged = false

  if (engaged && !flying.value && (Math.abs(dx) >= DRAG.threshold || flick)) {
    swipeDir.value = Math.sign(dx)
    switchMode(mode.value === 'login' ? 'register' : 'login')
    return
  }

  // 没拖够：弹回正中（走卡片自己的 0.46s 回弹曲线）
  drag.dx = 0
  swipeDir.value = 0
  backdropRef.value?.setCardDrag(0)
}

// 触控板横向滑动：同一个手势，不用按住也能切。
// 用 800ms 定窗累积，不用 setTimeout 归零 —— 定时器在低帧率机器上
// 会在两次滑动之间提前触发，一次真实的横滑永远攒不到阈值
let wheelAcc = 0
let wheelFirst = 0

function onWheel(event) {
  if (flying.value || drag.active) return
  if (Math.abs(event.deltaX) <= Math.abs(event.deltaY) * 1.3) return
  event.preventDefault()

  const now = performance.now()
  if (now - wheelFirst > 800) {
    wheelAcc = 0
    wheelFirst = now
  }
  wheelAcc += event.deltaX
  if (Math.abs(wheelAcc) < 70) return

  swipeDir.value = Math.sign(wheelAcc)
  wheelAcc = 0
  switchMode(mode.value === 'login' ? 'register' : 'login')
}

const loginForm = reactive({ account: '', password: '' })

const registerForm = reactive({
  username: '',
  email: '',
  nickname: '',
  password: '',
  confirm: '',
})

const loginRules = {
  account: [{ required: true, message: 'Enter your username or email', trigger: 'blur' }],
  password: [{ required: true, message: 'Enter your password', trigger: 'blur' }],
}

// 与后端 RegisterIn 的约束保持一致，避免提交后才报错
const USERNAME_RE = /^[A-Za-z0-9_\u4e00-\u9fff-]+$/

const registerRules = {
  username: [
    { required: true, message: 'Enter your username', trigger: 'blur' },
    { min: 3, max: 50, message: 'Use 3 to 50 characters', trigger: 'blur' },
    { pattern: USERNAME_RE, message: 'Use letters, numbers, underscores, and hyphens', trigger: 'blur' },
  ],
  email: [
    { required: true, message: 'Enter your email', trigger: 'blur' },
    { type: 'email', message: 'Enter a valid email address', trigger: 'blur' },
  ],
  password: [
    { required: true, message: 'Enter your password', trigger: 'blur' },
    { min: 6, max: 24, message: 'Use 6 to 24 characters', trigger: 'blur' },
  ],
  confirm: [
    { required: true, message: 'Enter your password again', trigger: 'blur' },
    {
      validator: (_rule, value, callback) => {
        if (value !== registerForm.password) callback(new Error('Passwords do not match'))
        else callback()
      },
      trigger: 'blur',
    },
  ],
}

// 0 = 太短，1~3 = 弱 / 稳 / 强
const strength = computed(() => {
  const value = registerForm.password
  if (!value) return 0
  if (value.length < 6) return 0
  let score = 1
  if (value.length >= 10) score += 1
  if (/[A-Z]/.test(value) && /[a-z]/.test(value)) score += 1
  if (/\d/.test(value) || /[^A-Za-z0-9]/.test(value)) score += 1
  return Math.min(3, score)
})

const strengthLabel = computed(() => ['Too short', 'Weak', 'Steady', 'Strong'][strength.value])

// 两个表单叠在同一格里，外层高度取当前那张的实际高度并做过渡
const stageStyle = computed(() => (stageHeight.value ? { height: `${stageHeight.value}px` } : {}))

function measureStage() {
  const pane = mode.value === 'login' ? loginPane.value : registerPane.value
  if (pane) stageHeight.value = pane.offsetHeight
}

// 把卡片在屏幕上的矩形交给 3D 片场：直升机据此停在表单外侧上角。
// 用 offset* 而不是 getBoundingClientRect：卡片此刻可能正在飞行/入场动画里，
// 布局值不受 transform 影响，量到的才是它「停稳之后」的位置
function measureCard() {
  const el = cardRef.value
  if (!el) return

  const root = el.closest('.auth')
  const frame = el.parentElement
  if (!root || !frame) return

  const width = el.offsetWidth
  const height = el.offsetHeight
  if (!width || !height) return

  const rootRect = root.getBoundingClientRect()
  const left = rootRect.left + frame.offsetLeft + (frame.offsetWidth - width) / 2
  const top = rootRect.top + frame.offsetTop + (frame.offsetHeight - height) / 2

  backdropRef.value?.setCardRect({
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    vw: window.innerWidth,
    vh: window.innerHeight,
  })
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

function onPointerMove(event) {
  if (flying.value || reduced || drag.active) return
  const rect = cardRef.value?.getBoundingClientRect()
  if (!rect) return

  const pad = 90
  const near =
    event.clientX > rect.left - pad &&
    event.clientX < rect.right + pad &&
    event.clientY > rect.top - pad &&
    event.clientY < rect.bottom + pad
  if (!near) {
    resetTilt()
    return
  }

  const px = clamp((event.clientX - rect.left) / rect.width - 0.5, -0.6, 0.6)
  const py = clamp((event.clientY - rect.top) / rect.height - 0.5, -0.6, 0.6)
  tilt.y = px * 5.5
  tilt.x = -py * 4.5
}

function resetTilt() {
  tilt.x = 0
  tilt.y = 0
}

let observer = null
let cardObserver = null
const timers = []

function wait(ms) {
  return new Promise((resolve) => {
    const id = setTimeout(resolve, ms)
    timers.push(id)
  })
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
}

onMounted(() => {
  measureStage()
  measureCard()

  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(() => measureStage())
    if (loginPane.value) observer.observe(loginPane.value)
    if (registerPane.value) observer.observe(registerPane.value)

    cardObserver = new ResizeObserver(() => measureCard())
    if (cardRef.value) cardObserver.observe(cardRef.value)
  }

  window.addEventListener('resize', measureCard)
})

onBeforeUnmount(() => {
  observer?.disconnect()
  cardObserver?.disconnect()
  window.removeEventListener('resize', measureCard)
  timers.forEach((id) => clearTimeout(id))
})

watch(mode, async () => {
  loading.value = false
  await nextTick()
  measureStage()
})

// 直接改地址栏 / 浏览器前进后退时，页面状态要跟上
watch(
  () => route.name,
  (name) => {
    const next = name === 'register' ? 'register' : 'login'
    if (next !== mode.value) mode.value = next
  },
)

/**
 * 切模式 = 一次镜头切换：
 * 直升机先拔高飞出画面，卡片同步滑出；黑边收进来；
 * 内容在卡片隐身的那一帧换掉；然后卡片从另一侧飞回，黑边退回。
 */
async function switchMode(next) {
  if (next === mode.value || flying.value) return

  if (reduced) {
    drag.dx = 0
    swipeDir.value = 0
    mode.value = next
    router.replace({ name: next, query: route.query })
    return
  }

  resetTilt()
  flying.value = 'out'
  await wait(FLY.out)

  mode.value = next
  router.replace({ name: next, query: route.query })
  // 隐身那一帧把拖拽位移归零：飞入必须从正中开始
  drag.dx = 0
  swipeDir.value = 0
  backdropRef.value?.setCardDrag(0)
  flying.value = 'pre'

  await nextTick()
  measureStage()
  await nextFrame()

  flying.value = 'in'
  await wait(FLY.in)
  flying.value = null
}

function redirectAfterAuth() {
  const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
  router.replace(redirect)
}

async function submitLogin() {
  const valid = await loginFormRef.value?.validate().catch(() => false)
  if (!valid) return

  loading.value = true
  try {
    const user = await auth.login(loginForm.account.trim(), loginForm.password)
    ElMessage.success(`Welcome back, ${user.nickname || user.username}`)
    redirectAfterAuth()
  } catch (error) {
    ElMessage.error(error.friendlyMessage || 'Sign in failed. Check your account and password.')
  } finally {
    loading.value = false
  }
}

async function submitRegister() {
  const valid = await registerFormRef.value?.validate().catch(() => false)
  if (!valid) return

  loading.value = true
  try {
    const payload = {
      username: registerForm.username.trim(),
      email: registerForm.email.trim(),
      password: registerForm.password,
    }
    const nickname = registerForm.nickname.trim()
    if (nickname) payload.nickname = nickname

    const user = await auth.register(payload)
    ElMessage.success(`Welcome to Lumen, ${user.nickname || user.username}`)
    redirectAfterAuth()
  } catch (error) {
    ElMessage.error(error.friendlyMessage || 'Sign up failed. Try again in a moment.')
  } finally {
    loading.value = false
  }
}
</script>

<style lang="scss" scoped>
.auth {
  position: relative;
  display: grid;
  place-items: center;
  min-height: calc(100vh - var(--navbar-height));
  padding: 44px 16px;
  overflow: hidden;
  background: #04070d;
}

.auth__frame {
  position: relative;
  z-index: 2;
  display: grid;
  place-items: center;
  width: 100%;
  perspective: 1500px;
  perspective-origin: 50% 45%;
  // 镜头推进到一半时卡片才浮上来：开场先看雪谷，再看见那张表单
  animation: auth-frame-in 1.05s cubic-bezier(0.22, 0.68, 0.2, 1) 1.35s both;
}

@keyframes auth-frame-in {
  from {
    opacity: 0;
    transform: translateY(22px) scale(0.985);
  }

  to {
    opacity: 1;
    transform: none;
  }
}

// 手势提示：贴在卡片下沿外侧，等卡片落稳之后再淡进来
.auth__hint {
  position: absolute;
  left: 50%;
  bottom: -34px;
  margin: 0;
  transform: translateX(-50%);
  font-size: 11px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  white-space: nowrap;
  color: rgba(230, 240, 252, 0.58);
  pointer-events: none;
  animation: auth-hint-in 0.9s ease 2.2s both;
}

@keyframes auth-hint-in {
  from {
    opacity: 0;
    transform: translate(-50%, 6px);
  }

  to {
    opacity: 1;
    transform: translate(-50%, 0);
  }
}

// ---------- 整卡 ----------
.auth__card {
  --dir: 1;
  --drag-x: 0px;
  --drag-rot: 0deg;
  --drag-scale: 1;

  position: relative;
  width: 100%;
  max-width: 780px;
  // 横向拖动归卡片自己，纵向留给页面/选字
  touch-action: pan-y;
  transform: translate3d(var(--drag-x), 0, 0) rotateY(var(--drag-rot)) scale(var(--drag-scale));
  transform-style: preserve-3d;
  will-change: transform, opacity;
  // 飞出用 ease-out：卡片一被推走就立刻开始移动。
  // 之前用 ease-in，前 200ms 几乎没位移、只有透明度在掉，
  // 读起来是「原地淡出」而不是「被甩出画面」
  transition:
    max-width 0.55s cubic-bezier(0.22, 0.68, 0.2, 1),
    transform 0.46s cubic-bezier(0.2, 0.8, 0.3, 1),
    opacity 0.3s ease 0.12s;
}

// 拖拽中：必须逐帧跟手，不能有任何过渡；顺手把光标与选字关掉
.auth__card.is-dragging {
  cursor: grabbing;
  user-select: none;
  transition: none;
}

.auth__card--login {
  --dir: -1;
}

.auth__card--register {
  --dir: 1;
  max-width: 840px;
}

// 飞出：往自己那一侧（或这次拖动的方向）滑出画面并轻微侧转，像被镜头甩出去
.auth__card.is-out {
  transform: translate3d(calc(var(--dir) * 118% + var(--drag-x)), 0, 0)
    rotateY(calc(var(--dir) * -22deg + var(--drag-rot))) scale(0.9);
  opacity: 0;
}

// 隐身换内容：无过渡地摆到同一侧的画面外，等下一帧再飞回来
.auth__card.is-pre {
  transition: none;
  transform: translate3d(calc(var(--dir) * 118% + var(--drag-x)), 0, 0)
    rotateY(calc(var(--dir) * -22deg + var(--drag-rot))) scale(0.9);
  opacity: 0;
}

// 飞入：从另一侧（各自模式的那一侧）滑回正中
.auth__card.is-in {
  transition:
    max-width 0.55s cubic-bezier(0.22, 0.68, 0.2, 1),
    transform 0.94s cubic-bezier(0.16, 0.84, 0.24, 1),
    opacity 0.62s ease;
  transform: none;
  opacity: 1;
}

// 内层：白卡本体 + 指针视差。
// 背景是投影雪谷，卡片必须实白：半透明 + backdrop-filter 会被 Chrome
// 单独模糊背景再错位贴回来，极光会在卡上留一团灰斑
.auth__surface {
  position: relative;
  display: grid;
  grid-template-columns: 300px minmax(0, 1fr);
  border-radius: 24px;
  border: 1px solid rgba(255, 255, 255, 0.8);
  background: #ffffff;
  box-shadow:
    0 40px 90px -40px rgba(0, 0, 0, 0.82),
    0 0 0 1px rgba(9, 12, 18, 0.04);
  overflow: hidden;
  transform-style: preserve-3d;
  transition: transform 0.22s ease-out, box-shadow 0.4s ease;
  will-change: transform;
}

.auth__surface:hover {
  box-shadow:
    0 52px 104px -42px rgba(0, 0, 0, 0.9),
    0 0 0 1px rgba(9, 12, 18, 0.05);
}

// ---------- 左：剧照 ----------
.auth__visual {
  position: relative;
  min-height: 320px;
  overflow: hidden;
  background: $color-ink-soft;
}

.auth__visual::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  // 人像去色再压一层冷调：雪谷场景里出现夏天绿地和暖肤色会很跳
  background: linear-gradient(180deg, rgba(46, 120, 138, 0.2), rgba(12, 24, 44, 0.36));
  mix-blend-mode: color;
}

.auth__visual::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    // 顶部也压一层：注册那张原片上半幅是雾天，留白太亮会把整块卡片顶得发飘
    linear-gradient(to bottom, rgba(9, 10, 12, 0.42) 0%, rgba(9, 10, 12, 0) 26%),
    linear-gradient(
      to top,
      rgba(9, 10, 12, 0.92) 0%,
      rgba(9, 10, 12, 0.42) 38%,
      rgba(9, 10, 12, 0.1) 100%
    ),
    // 暗角：把人像从雾里拎出来，否则整格是一张平铺的灰照片
    radial-gradient(
      118% 88% at 50% 42%,
      rgba(6, 10, 16, 0) 32%,
      rgba(6, 10, 16, 0.3) 72%,
      rgba(6, 10, 16, 0.62) 100%
    );
}

.auth__shot {
  position: absolute;
  inset: 0;
  background-size: cover;
  opacity: 0;
  transform: scale(1.05);
  filter: grayscale(1) contrast(1.12) brightness(0.94);
  transition:
    opacity 0.62s ease,
    transform 1.4s cubic-bezier(0.22, 0.68, 0.2, 1);
}

.auth__shot--login {
  background-image: url('../assets/auth-login.jpg');
  background-position: center 22%;
  opacity: 1;
  filter: grayscale(1) contrast(1.12) brightness(0.94);
}

.auth__shot--register {
  // 640×640 的方图裁进 300×560 的竖条：脸在原图偏左、略低于中线，
  // 位置取 28% / 40% 才让脸落在这一格的中段
  background-image: url('../assets/auth-register.jpg');
  // 必须让「宽 × 高」都盖满这一格（300×560），否则 `auto` 高度不足 560，
  // 上下会露出背景色的一块平板灰。200% 之后是 600×600，仍有裁切余量
  background-size: 200% auto;
  background-repeat: no-repeat;
  background-position: 28% 40%;
  // 原片又亮又灰（白衣 + 雾天），只调亮度和对比会把中间调一起提亮、
  // 变成一张发白的雾照。用 multiply 叠一层冷灰，把整张压成低对比的夜光人像
  background-color: #798da4;
  background-blend-mode: multiply;
  filter: grayscale(1) contrast(1.34);
}

.auth__shot.is-out {
  opacity: 0;
  transform: scale(1);
}

.auth__shot.is-in {
  opacity: 1;
  transform: scale(1);
}

.auth__visual-body {
  position: absolute;
  z-index: 2;
  right: 0;
  bottom: 0;
  left: 0;
  padding: 20px 22px 22px;
}

.auth__visual-brand {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.76);
}

.auth__visual-quote {
  margin-top: 8px;
  max-width: 232px;
  font-family: 'Songti SC', 'Noto Serif SC', 'Source Han Serif SC', 'SimSun', serif;
  font-size: 25px;
  line-height: 1.32;
  letter-spacing: 0.03em;
  color: #fff;
  text-shadow: 0 1px 12px rgba(0, 0, 0, 0.35);
}

.quote-enter-active,
.quote-leave-active {
  transition:
    opacity 0.28s ease,
    transform 0.4s cubic-bezier(0.22, 0.68, 0.2, 1);
}

.quote-enter-from {
  opacity: 0;
  transform: translateY(10px);
}

.quote-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

// ---------- 右：表单 ----------
.auth__panel {
  display: flex;
  flex-direction: column;
  padding: 22px 30px 24px;
}

// 原来那颗黑胶囊换成了这一行：左边是身份标签，右边是去另一边的入口
.auth__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 18px;
  padding-bottom: 14px;
  border-bottom: 1px solid rgba(29, 29, 31, 0.08);
}

.auth__eyebrow {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: rgba(29, 29, 31, 0.42);
}

.auth__other {
  display: inline-flex;
  align-items: baseline;
  gap: 5px;
  padding: 0;
  border: 0;
  background: transparent;
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  color: $color-primary;
  cursor: pointer;
  transition: color 0.24s ease, opacity 0.24s ease;

  &:hover {
    color: #0059b3;
  }

  &:disabled {
    opacity: 0.4;
    cursor: default;
  }
}

.auth__other-arrow {
  font-size: 12px;
  transition: transform 0.24s cubic-bezier(0.22, 0.68, 0.2, 1);
}

.auth__other:hover .auth__other-arrow {
  transform: translateX(3px);
}

// 两张表单叠在同一格，高度跟着当前那张缓动
.auth__stage {
  position: relative;
  transition: height 0.5s cubic-bezier(0.22, 0.68, 0.2, 1);
}

.auth__pane {
  position: absolute;
  top: 0;
  right: 0;
  left: 0;
  display: flex;
  flex-direction: column;
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  transform: translateY(10px) scale(0.994);
  transition:
    opacity 0.28s ease,
    transform 0.46s cubic-bezier(0.22, 0.68, 0.2, 1),
    visibility 0.46s;
}

.auth__pane.is-active {
  opacity: 1;
  visibility: visible;
  pointer-events: auto;
  transform: none;
}

// 进场错峰：标题先落，字段随后一级一级跟上
.auth__rise {
  opacity: 0;
}

.auth__pane.is-active .auth__rise {
  animation: auth-rise 0.52s cubic-bezier(0.22, 0.68, 0.2, 1) both;
  animation-delay: calc(var(--d, 0) * 45ms);
}

@keyframes auth-rise {
  from {
    opacity: 0;
    transform: translateY(12px);
  }

  to {
    opacity: 1;
    transform: none;
  }
}

.auth__title {
  font-size: 26px;
  font-weight: 600;
  letter-spacing: -0.025em;
  color: $color-text;
}

.auth__desc {
  margin-top: 8px;
  font-size: 13px;
  line-height: 1.6;
  color: $color-text-secondary;
}

.auth__form {
  margin-top: 20px;
}

// 两个短字段并排，卡片不至于太长
.auth__row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;

  @include respond(420px) {
    grid-template-columns: 1fr;
    gap: 0;
  }
}

// 卡片是白底，输入框用浅灰填充而不是实边框
.auth__panel :deep(.el-input__wrapper) {
  background: rgba(245, 245, 247, 0.9);
  border: 1px solid transparent;

  &:hover {
    background: #efeff2;
  }

  &.is-focus {
    background: #ffffff;
    border-color: rgba(0, 113, 227, 0.45);
    box-shadow: 0 0 0 3px rgba(0, 113, 227, 0.12);
  }
}

.auth__strength {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: -2px 0 14px;
  font-size: 11px;
  color: $color-text-secondary;
}

.auth__strength-bars {
  display: inline-flex;
  gap: 4px;

  i {
    display: block;
    width: 26px;
    height: 3px;
    border-radius: 2px;
    background: rgba(29, 29, 31, 0.12);
    transition: background 0.3s ease;
  }
}

.auth__strength[data-score='1'] .auth__strength-bars i:nth-child(-n + 1) {
  background: #c8452f;
}

.auth__strength[data-score='2'] .auth__strength-bars i:nth-child(-n + 2) {
  background: #b58500;
}

.auth__strength[data-score='3'] .auth__strength-bars i {
  background: #2f7d55;
}

.hint-enter-active,
.hint-leave-active {
  transition:
    opacity 0.24s ease,
    transform 0.3s ease;
}

.hint-enter-from,
.hint-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

.auth__submit {
  width: 100%;
  margin-top: 4px;
}

.auth__foot {
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px solid $color-border;
  font-size: 12px;
  color: $color-text-secondary;
  text-align: center;
}

.auth__link {
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  color: $color-primary;
  cursor: pointer;

  &:hover {
    text-decoration: underline;
  }
}

// ---------- 转场：黑边与扫光 ----------
.auth__bars {
  position: absolute;
  inset: 0;
  z-index: 3;
  pointer-events: none;
}

.auth__bar {
  position: absolute;
  left: 0;
  right: 0;
  height: 6.5vh;
  background: #000;
  // 用 scaleY 而不是 height：高度过渡要每帧重排整页，
  // 而这段时间正好是 3D 场景 + 卡片飞行动画最吃主线程的一刻，会卡成台阶
  transition: transform 0.22s cubic-bezier(0.2, 0.8, 0.3, 1);
}

.auth__bar--top {
  top: 0;
  transform: scaleY(0);
  transform-origin: top center;
}

.auth__bar--bottom {
  bottom: 0;
  transform: scaleY(0);
  transform-origin: bottom center;
}

.auth__bars.is-live .auth__bar {
  transform: scaleY(1);
}

.auth__sheen {
  position: absolute;
  inset: 0;
  z-index: 3;
  pointer-events: none;
  opacity: 0;
  background: linear-gradient(
    104deg,
    rgba(255, 255, 255, 0) 34%,
    rgba(255, 255, 255, 0.55) 48%,
    rgba(255, 255, 255, 0) 62%
  );
  transform: translateX(-130%);
}

.auth__sheen.is-sweeping {
  animation: auth-sheen 0.9s cubic-bezier(0.3, 0.2, 0.4, 1) both;
}

@keyframes auth-sheen {
  0% {
    opacity: 0;
    transform: translateX(-130%);
  }

  18% {
    opacity: 0.8;
  }

  100% {
    opacity: 0;
    transform: translateX(130%);
  }
}

@include respond($bp-md) {
  .auth__surface {
    grid-template-columns: 260px minmax(0, 1fr);
  }
}

// 再窄就放不下左右分栏了：撤掉剧照，只留表单
@include respond(760px) {
  .auth__card,
  .auth__card--register {
    max-width: 460px;
  }

  .auth__surface {
    grid-template-columns: minmax(0, 1fr);
  }

  .auth__visual {
    display: none;
  }
}

@include respond($bp-sm) {
  .auth {
    padding: 24px 16px;
  }

  .auth__surface {
    border-radius: 18px;
  }

  .auth__panel {
    padding: 20px 22px 20px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .auth__frame {
    animation: none;
  }

  .auth__card,
  .auth__surface,
  .auth__bar {
    transition: none;
  }

  .auth__sheen {
    display: none;
  }
}
</style>
