<template>
  <el-popover
    v-model:visible="open"
    :width="352"
    trigger="click"
    placement="top-start"
    :teleported="true"
    :show-arrow="false"
    :offset="12"
    popper-class="emoji-popper"
  >
    <template #reference>
      <button
        type="button"
        class="emoji-trigger"
        :class="{ 'emoji-trigger--on': open }"
        aria-label="Insert emoji"
        :aria-expanded="open"
      >
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.6" />
          <circle cx="8.6" cy="10" r="1.25" fill="currentColor" />
          <circle cx="15.4" cy="10" r="1.25" fill="currentColor" />
          <path
            d="M7.8 14.2c1 1.6 2.5 2.4 4.2 2.4s3.2-.8 4.2-2.4"
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
          />
        </svg>
      </button>
    </template>

    <div class="ep">
      <header class="ep__bar">
        <span class="ep__title">{{ activeLabel }}</span>
        <button
          type="button"
          class="ep__recent"
          :class="{ 'ep__recent--on': activeKey === 'recent' }"
          @click="activeKey = 'recent'"
        >
          <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
            <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.6" />
            <path
              d="M12 7.5v5l3.2 1.9"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linecap="round"
            />
          </svg>
          <span>Recent</span>
        </button>
      </header>

      <div class="ep__body">
        <div v-if="currentEmojis.length" class="ep__grid">
          <button
            v-for="e in currentEmojis"
            :key="e"
            type="button"
            class="ep__cell"
            :title="e"
            @click="pick(e)"
          >
            {{ e }}
          </button>
        </div>
        <p v-else class="ep__empty">Emojis you use will show up here</p>
      </div>

      <!-- 底部类目条：和手机输入法的表情面板一致，先选大类再看格子 -->
      <nav class="ep__tabs" aria-label="Emoji categories">
        <button
          v-for="g in EMOJI_GROUPS"
          :key="g.key"
          type="button"
          class="ep__tab"
          :class="{ 'ep__tab--on': activeKey === g.key }"
          :title="g.label"
          :aria-label="g.label"
          @click="activeKey = g.key"
        >
          {{ g.glyph }}
        </button>
        <button type="button" class="ep__tab ep__tab--clock" title="Recently used" @click="activeKey = 'recent'">
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.6" />
            <path
              d="M12 7.5v5l3.2 1.9"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linecap="round"
            />
          </svg>
        </button>
      </nav>
    </div>
  </el-popover>
</template>

<script setup>
import { computed, ref } from 'vue'

import { EMOJI_GROUPS, loadRecentEmojis, rememberEmoji } from '@/utils/emoji'

const emit = defineEmits(['select'])

const open = ref(false)
const activeKey = ref('faces')
const recent = ref(loadRecentEmojis())

const activeLabel = computed(() => {
  if (activeKey.value === 'recent') return 'Recently used'
  return EMOJI_GROUPS.find((g) => g.key === activeKey.value)?.label || ''
})

const currentEmojis = computed(() => {
  if (activeKey.value === 'recent') return recent.value
  return EMOJI_GROUPS.find((g) => g.key === activeKey.value)?.emojis || []
})

function pick(emoji) {
  recent.value = rememberEmoji(emoji)
  emit('select', emoji)
}
</script>

<style lang="scss" scoped>
.emoji-trigger {
  flex: none;
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: $color-text-muted;
  cursor: pointer;
  transition: color 0.18s ease, background 0.18s ease, transform 0.18s ease;

  &:hover {
    color: $color-primary;
    background: rgba(0, 113, 227, 0.08);
  }

  &:active {
    transform: scale(0.92);
  }
}

.emoji-trigger--on {
  color: $color-primary;
  background: rgba(0, 113, 227, 0.1);
}

.ep {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
}

.ep__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding-inline: 2px;
}

.ep__title {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: $color-text-secondary;
}

.ep__recent {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 9px;
  border-radius: 999px;
  border: 1px solid transparent;
  background: transparent;
  font-size: 11px;
  font-family: inherit;
  color: $color-text-muted;
  cursor: pointer;
  transition: color 0.18s ease, background 0.18s ease;

  &:hover {
    color: $color-text;
    background: $color-bg-hover;
  }
}

.ep__recent--on {
  color: $color-primary;
  background: $color-primary-soft;
}

.ep__body {
  max-height: 248px;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.ep__grid {
  display: grid;
  grid-template-columns: repeat(8, minmax(0, 1fr));
  gap: 2px;
}

// 每个格子等比正方形，图标居中；悬停只做浅底 + 轻微放大
.ep__cell {
  display: grid;
  place-items: center;
  aspect-ratio: 1;
  padding: 0;
  border: none;
  border-radius: $radius-sm;
  background: transparent;
  font-size: 21px;
  line-height: 1;
  cursor: pointer;
  transition: background 0.15s ease, transform 0.15s ease;

  &:hover {
    background: $color-bg-hover;
    transform: scale(1.16);
  }

  &:active {
    transform: scale(0.98);
  }
}

.ep__empty {
  padding: 26px 8px;
  font-size: 12px;
  color: $color-text-muted;
  text-align: center;
}

.ep__tabs {
  display: flex;
  align-items: center;
  gap: 2px;
  padding-top: 8px;
  border-top: 1px solid $color-border;
}

.ep__tab {
  display: grid;
  place-items: center;
  flex: 1 1 0;
  height: 30px;
  padding: 0;
  border: none;
  border-radius: $radius-sm;
  background: transparent;
  font-size: 17px;
  line-height: 1;
  cursor: pointer;
  transition: background 0.15s ease, transform 0.15s ease;

  &:hover {
    background: $color-bg-hover;
  }

  &:active {
    transform: scale(0.94);
  }
}

.ep__tab--on {
  background: $color-primary-soft;
}

.ep__tab--clock {
  flex: 0 0 34px;
  color: $color-text-muted;

  &:hover {
    color: $color-primary;
  }
}
</style>

<style lang="scss">
// popover 的内容被 teleport 到 body，scoped 样式够不到，这里统一给面板外观
.emoji-popper.el-popper,
.emoji-popper.el-popper .el-popover {
  padding: 0 !important;
}

.emoji-popper.el-popper {
  border-radius: 16px !important;
  border: 1px solid rgba(0, 0, 0, 0.06);
  box-shadow: var(--shadow-pop);
  background: #ffffff;
  overflow: hidden;
}
</style>
