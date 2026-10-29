<template>
  <div class="variants">
    <button
      v-for="v in variants"
      :key="v.size_code"
      type="button"
      class="variants__item"
      :class="{ 'is-active': v.size_code === modelValue }"
      @click="$emit('update:modelValue', v.size_code)"
    >
      <span class="variants__name">{{ VARIANT_LABELS[v.size_code] || v.size_code }}</span>
      <span class="variants__dim">{{ v.width }} × {{ v.height }}</span>
      <span class="variants__size">{{ formatFileSize(v.file_size) }}</span>
    </button>
  </div>
</template>

<script setup>
import { VARIANT_LABELS } from '@/utils/constants'
import { formatFileSize } from '@/utils/format'

defineProps({
  variants: { type: Array, default: () => [] },
  modelValue: { type: String, default: 'original' },
})

defineEmits(['update:modelValue'])
</script>

<style lang="scss" scoped>
.variants {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 10px;
}

.variants__item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 9px 12px;
  text-align: left;
  background: $color-bg-card;
  border: 1px solid $color-border;
  border-radius: $radius-base;
  cursor: pointer;
  transition: border-color 0.18s ease, background 0.18s ease;

  &:hover {
    border-color: $color-border-strong;
  }

  &.is-active {
    border-color: $color-primary;
    background: $color-primary-soft;
  }
}

.variants__name {
  font-size: 13px;
  font-weight: 600;
  color: $color-text;

  .variants__item.is-active & {
    color: $color-primary;
  }
}

.variants__dim {
  font-size: 12px;
  color: $color-text-secondary;
  font-variant-numeric: tabular-nums;
}

.variants__size {
  font-size: 12px;
  color: $color-text-muted;
}
</style>