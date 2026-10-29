<template>
  <div ref="containerRef" class="masonry" :style="{ height: `${containerHeight}px` }">
    <ImageCard
      v-for="(item, index) in items"
      :key="item.id"
      v-tilt
      :image="item"
      :style="styleFor(index)"
      @favorite-change="$emit('favorite-change', $event)"
    />
  </div>
</template>

<script setup>
import ImageCard from '@/components/image/ImageCard.vue'
import { useMasonry } from '@/composables/useMasonry'

const props = defineProps({
  items: { type: Array, default: () => [] },
  colMin: { type: Number, default: 240 },
  gap: { type: Number, default: 16 },
})

defineEmits(['favorite-change'])

const { containerRef, positions, containerHeight } = useMasonry(
  () => props.items,
  { colMin: props.colMin, gap: props.gap },
)

function styleFor(index) {
  const p = positions.value[index]
  if (!p) return { opacity: 0 }
  return {
    left: `${p.left}px`,
    top: `${p.top}px`,
    width: `${p.width}px`,
    height: `${p.height}px`,
  }
}
</script>

<style lang="scss" scoped>
.masonry {
  position: relative;
  width: 100%;
  // 3D 倾斜的透视放在容器上（一份就够），不要每张卡各带一份 perspective
  perspective: 1000px;
  transition: height 0.25s ease;
}
</style>