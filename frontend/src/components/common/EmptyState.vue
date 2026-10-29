<template>
  <div class="empty" :class="{ 'empty--compact': compact }">
    <p class="empty__title">{{ title }}</p>
    <p v-if="description" class="empty__desc">{{ description }}</p>
    <div v-if="$slots.default" class="empty__action">
      <slot />
    </div>
  </div>
</template>

<script setup>
defineProps({
  title: { type: String, default: 'Nothing here yet' },
  description: { type: String, default: '' },
  compact: { type: Boolean, default: false },
})
</script>

<style lang="scss" scoped>
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 72px 24px;
  text-align: center;
  background: $color-bg-card;
  border: 1px dashed $color-border-strong;
  border-radius: $radius-card;
}

.empty--compact {
  padding: 40px 20px;
}

.empty__title {
  font-size: 14px;
  font-weight: 600;
  color: $color-text;
}

.empty__desc {
  font-size: 12px;
  color: $color-text-muted;
  max-width: 380px;
}

.empty__action {
  margin-top: 10px;
}
</style>