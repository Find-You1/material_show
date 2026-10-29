<template>
  <!-- 登录 / 注册页的底：雪谷 + 极光 + 一架悬停的直升机。
       片场在本组件里挂载，模式（login / register）由页面传进来：
       切模式时直升机从一侧飞走、再从相对的一侧绕回来，极光配色也跟着换。 -->
  <div class="backdrop" aria-hidden="true">
    <div ref="host" class="backdrop__stage"></div>
    <div class="backdrop__grade"></div>
    <div class="backdrop__grain"></div>
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { AuthScene } from '@/three/auth/AuthScene'

const props = defineProps({
  mode: { type: String, default: 'login' },
})

const host = ref(null)
let scene = null

onMounted(() => {
  if (!host.value) return
  scene = new AuthScene(host.value, { mode: props.mode })
})

watch(
  () => props.mode,
  (mode) => scene?.setMode(mode),
)

// 页面把「表单卡在屏幕上的矩形」交给片场：直升机据此停在卡片外侧上角
function setCardRect(rect) {
  scene?.setCardRect(rect)
}

// 拖动卡片时把位移一并传下去，直升机跟着卡片走
function setCardDrag(dx) {
  scene?.setCardDrag(dx)
}

onBeforeUnmount(() => {
  scene?.dispose()
  scene = null
})

defineExpose({ setCardRect, setCardDrag })
</script>

<style lang="scss" scoped>
.backdrop {
  // 铺到整个视口、包括导航栏背后：深色毛玻璃导航压在雪谷上，
  // 才是真正的「开场」。只铺卡片这一块的话，导航栏背后是白底，
  // 半透明黑会被抬成中灰，一条灰条把画面割断
  position: fixed;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  background: #04070d;
}

.backdrop__stage {
  position: absolute;
  inset: 0;

  :deep(canvas) {
    display: block;
    width: 100%;
    height: 100%;
  }
}

// 电影感的三件事：暗角、天空顶部压黑、底部压暗。
// 中间那一条（卡片所在的位置）必须留空，否则极光与雪地的层次全被压平
.backdrop__grade {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    radial-gradient(
      120% 92% at 50% 46%,
      rgba(2, 4, 8, 0) 0%,
      rgba(2, 4, 8, 0) 46%,
      rgba(2, 4, 8, 0.3) 78%,
      rgba(2, 4, 8, 0.62) 100%
    ),
    linear-gradient(
      180deg,
      rgba(2, 4, 8, 0.4) 0%,
      rgba(2, 4, 8, 0) 20%,
      rgba(2, 4, 8, 0.04) 54%,
      rgba(2, 4, 8, 0.34) 100%
    );
}

// 颗粒：静态噪点，不闪。只负责把数字渲染的味道洗掉
.backdrop__grain {
  position: absolute;
  inset: -20%;
  opacity: 0.075;
  pointer-events: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='180' height='180' filter='url(%23n)'/%3E%3C/svg%3E");
  background-size: 180px 180px;
  mix-blend-mode: overlay;
}
</style>
