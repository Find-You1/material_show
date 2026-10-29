<template>
  <div class="stat" :class="`stat--${size}`">
    <div class="stat__value">
      {{ display }}
      <span v-if="suffix" class="stat__suffix">{{ suffix }}</span>
    </div>
    <div class="stat__label">{{ label }}</div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  value: { type: [Number, String], default: 0 },
  label: { type: String, default: '' },
  suffix: { type: String, default: '' },
  // default：卡片内嵌用；large：统计页用，数值更大更有分量
  size: { type: String, default: 'default' },
})

const display = computed(() => {
  if (props.value === null || props.value === undefined || props.value === '') return '0'
  const n = Number(props.value)
  if (Number.isNaN(n)) return String(props.value)
  return n.toLocaleString('zh-CN')
})
</script>

<style lang="scss" scoped>
.stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.stat__value {
  font-size: 15px;
  font-weight: 600;
  line-height: 1.3;
  color: $color-primary;
  font-variant-numeric: tabular-nums;
}

.stat__label {
  font-size: 12px;
  line-height: 1.4;
  color: $color-text-secondary;
}

.stat__suffix {
  margin-left: 2px;
  font-size: 12px;
  font-weight: 500;
}

.stat--large {
  .stat__value {
    font-size: 30px;
    font-weight: 700;
    letter-spacing: -0.5px;
    color: $color-text;
  }

  .stat__label {
    font-size: 13px;
  }

  .stat__suffix {
    font-size: 13px;
  }
}
</style>