<template>
  <div
    ref="host"
    class="road"
    role="img"
    aria-label="A white mountain road at night with a sports car driving toward a vanishing point at the upper right. Framed photographs line the right side; click any frame to open it."
  >
    <!-- 顶部压暗：白字压在夜空上要读得清。底部不再压暗，否则近处白色路面会发灰 -->
    <div class="road__haze" aria-hidden="true"></div>
    <!-- 极淡胶片颗粒，和全站黑场保持同一质感 -->
    <div class="road__grain" aria-hidden="true"></div>
  </div>
</template>

<script setup>
/**
 * 山路片场（Three.js 版）。
 *
 * 真正的 3D：白色路面沿闭合山路铺开，跑车沿切线前进，相机吊在车后偏右，
 * 于是近处路面落在左下、远处收束到右上。画框是路边的照片平面，每帧只绕
 * Y 轴转向相机；点击后相机沿视线推进，再把画框的屏幕矩形交给放映层转场。
 *
 * 实现在 src/three/road/ 下按职责拆开：
 * config（色板/参数）、path（曲线与标架）、road（路/虚线/护栏）、
 * terrain（远山/地面）、car（程序化跑车）、boards（照片画框）、
 * MonochromeRoad（渲染循环、相机、拾取、转场）。
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { MonochromeRoad } from '@/three/road/MonochromeRoad'

const props = defineProps({
  items: { type: Array, default: () => [] },
})

const emit = defineEmits(['select', 'ready', 'theme'])

const host = ref(null)
let scene = null

onMounted(() => {
  if (!host.value) return

  scene = new MonochromeRoad(host.value, {
    items: props.items,
    onSelect: (payload) => emit('select', payload),
    onReady: () => emit('ready'),
    // 自动轮播会把当前主题报上来，让页面的分段控件跟着高亮
    onTheme: (index) => emit('theme', index),
  })
})

watch(
  () => props.items,
  (items) => scene?.setItems(items),
)

onBeforeUnmount(() => {
  scene?.dispose()
  scene = null
})

// 放映层关闭时把相机送回车上；主题切换只改颜色
defineExpose({
  resetView: () => scene?.resetView(),
  setTheme: (index) => scene?.setTheme(index),
})
</script>

<style lang="scss" scoped>
.road {
  position: absolute;
  inset: 0;
  overflow: hidden;
  background: #050506;
}

.road__haze {
  position: absolute;
  inset: 0;
  pointer-events: none;
  // 顶部压暗只压左边文案那一块：整条横幅压暗会把右上的太阳/月亮
  // 一起调成灰片（DOM 遮罩是乘在画布结果上的，3D 里再亮也顶不过去）
  background:
    linear-gradient(
      100deg,
      rgba(3, 3, 5, 0.5) 0%,
      rgba(3, 3, 5, 0.26) 26%,
      rgba(3, 3, 5, 0.06) 46%,
      rgba(3, 3, 5, 0) 60%
    ),
    linear-gradient(180deg, rgba(3, 3, 5, 0.18) 0%, rgba(3, 3, 5, 0) 30%);
}

.road__grain {
  position: absolute;
  inset: -40%;
  pointer-events: none;
  opacity: 0.09;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='180' height='180' filter='url(%23n)'/%3E%3C/svg%3E");
  background-size: 180px 180px;
  mix-blend-mode: overlay;
}
</style>
