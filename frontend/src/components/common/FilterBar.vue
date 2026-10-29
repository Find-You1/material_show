<template>
  <div class="filterbar">
    <div
      class="filterbar__grid u-filter-grid"
      :class="{ 'filterbar__grid--center-order': centerOrder }"
    >
      <div class="filterbar__count">
        <span class="u-value">{{ total }}</span>
        <span class="u-label">images</span>
      </div>

      <RubberSegment
        v-if="orderOptions.length"
        class="filterbar__order"
        :model-value="order"
        :items="orderOptions"
        size="sm"
        aria-label="Sort by"
        @update:model-value="$emit('update:order', $event)"
      />

      <!-- 各页面自己塞分类/标签等筛选项，保持一行均匀分布 -->
      <slot />
    </div>

    <div v-if="chips.length" class="filterbar__chips">
      <span
        v-for="chip in chips"
        :key="chip.key"
        class="filterbar__chip"
        @click="$emit('remove-filter', chip.key)"
      >
        {{ chip.label }}
        <el-icon><Close /></el-icon>
      </span>
      <button type="button" class="filterbar__reset" @click="$emit('reset')">Reset</button>
    </div>
  </div>
</template>

<script setup>
import { Close } from '@element-plus/icons-vue'

import RubberSegment from '@/components/common/RubberSegment.vue'

defineProps({
  total: { type: Number, default: 0 },
  order: { type: String, default: '' },
  orderOptions: { type: Array, default: () => [] },
  // [{ key, label }]，点击即移除对应筛选条件
  chips: { type: Array, default: () => [] },
  // 整条里只有「张图片 + 排序」两项时置 true，让排序控件落在几何中心
  centerOrder: { type: Boolean, default: false },
})

defineEmits(['update:order', 'remove-filter', 'reset'])
</script>

<style lang="scss" scoped>
.filterbar {
  margin-bottom: 18px;
  padding: 12px 16px;
  background: $color-bg-card;
  border: 1px solid $color-border;
  border-radius: $radius-card;
  box-shadow: $shadow-card;
}

.filterbar__count {
  display: flex;
  align-items: baseline;
  gap: 4px;
}

.filterbar__order {
  justify-self: start;
}

// 整条里只有「张图片 + 排序」两项时，两侧留等宽白位，分段控件落在几何中心
.filterbar__grid--center-order {
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
}

.filterbar__chips {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid $color-border;
}

.filterbar__chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  border-radius: 999px;
  background: $color-primary-soft;
  color: $color-primary;
  font-size: 12px;
  cursor: pointer;

  &:hover {
    background: $color-primary;
    color: #ffffff;
  }
}

.filterbar__reset {
  margin-left: auto;
  padding: 3px 8px;
  border: none;
  background: transparent;
  font-size: 12px;
  color: $color-text-muted;
  cursor: pointer;

  &:hover {
    color: $color-danger;
  }
}
</style>