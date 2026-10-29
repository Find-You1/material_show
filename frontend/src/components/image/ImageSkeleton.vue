<template>
  <div class="skeleton">
    <div v-for="n in count" :key="n" class="skeleton__item" :style="itemStyle(n)" />
  </div>
</template>

<script setup>
const props = defineProps({
  count: { type: Number, default: 12 },
  // 高度随机梯度，骨架也有瀑布流的错落感，避免整片灰块
  minHeight: { type: Number, default: 180 },
  maxHeight: { type: Number, default: 320 },
})

const ratios = [1, 1.3, 0.78, 1.15, 0.9, 1.45, 1.05, 0.85, 1.25, 0.95, 1.35, 1.1]

function itemStyle(n) {
  const ratio = ratios[(n - 1) % ratios.length]
  const h = Math.round(props.minHeight * ratio)
  return { height: `${Math.min(props.maxHeight, h)}px` }
}
</script>

<style lang="scss" scoped>
.skeleton {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 16px;
}

.skeleton__item {
  position: relative;
  overflow: hidden;
  border-radius: $radius-card;
  background: #ececf0;

  &::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(
      100deg,
      rgba(255, 255, 255, 0) 30%,
      rgba(255, 255, 255, 0.7) 50%,
      rgba(255, 255, 255, 0) 70%
    );
    background-size: 200% 100%;
    animation: shimmer 1.4s infinite;
  }
}

@keyframes shimmer {
  0% {
    background-position: 150% 0;
  }
  100% {
    background-position: -50% 0;
  }
}
</style>