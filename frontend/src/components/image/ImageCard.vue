<template>
  <article class="card" @click="open">
    <div class="card__media" :style="{ background: image.dominant_color || '#e5e5ea' }">
      <img
        class="card__img"
        :class="{ 'is-loaded': loaded }"
        :src="image.thumb_url"
        :alt="image.title"
        :width="image.width"
        :height="image.height"
        loading="lazy"
        decoding="async"
        @load="loaded = true"
        @error="onError"
      />

      <!-- 底部信息条：hover 浮现 -->
      <div class="card__overlay">
        <div class="card__title">{{ image.title }}</div>
        <div class="card__meta">
          <span class="card__author">
            <el-avatar :size="18" :src="image.owner?.avatar_url || ''" class="card__avatar">
              {{ (image.owner?.username || '?').slice(0, 1).toUpperCase() }}
            </el-avatar>
            <span class="card__author-name">{{ image.owner?.username }}</span>
          </span>
          <button
            type="button"
            class="card__download"
            :disabled="downloading"
            @click.stop="onDownload"
          >
            <el-icon><Download /></el-icon>
            <span>Download</span>
          </button>
        </div>
      </div>

      <!-- 收藏按钮 -->
      <button
        v-if="showFavorite"
        type="button"
        class="card__fav"
        :class="{ 'is-on': image.is_favorited }"
        :disabled="favBusy"
        :title="image.is_favorited ? 'Remove from saved' : 'Save'"
        @click.stop="toggleFavorite"
      >
        <el-icon><StarFilled /></el-icon>
      </button>

      <!-- 来源标记：官方内容给个低调标识，避免和用户投稿混淆 -->
      <span v-if="image.source === 'official'" class="card__badge">Official</span>

      <div v-if="!loaded" class="card__shimmer" />
    </div>
  </article>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Download, StarFilled } from '@element-plus/icons-vue'

import { favoriteImage, unfavoriteImage } from '@/api/modules/images'
import { useAuthStore } from '@/stores/auth'
import { useDownload } from '@/composables/useDownload'

const props = defineProps({
  image: { type: Object, required: true },
})

const emit = defineEmits(['favorite-change'])

const router = useRouter()
const auth = useAuthStore()

const loaded = ref(false)
const favBusy = ref(false)
const failed = ref(false)

const { busy: downloading, download } = useDownload()

const showFavorite = computed(() => !failed.value)

function open() {
  router.push({ name: 'photo', params: { id: props.image.id } })
}

function onError() {
  loaded.value = true
  failed.value = true
}

async function onDownload() {
  await download(props.image.id, 'original')
}

async function toggleFavorite() {
  if (!auth.isLoggedIn) {
    ElMessage.warning('Sign in to save images')
    router.push({ name: 'login', query: { redirect: router.currentRoute.value.fullPath } })
    return
  }
  if (favBusy.value) return
  favBusy.value = true
  try {
    const res = props.image.is_favorited
      ? await unfavoriteImage(props.image.id)
      : await favoriteImage(props.image.id)
    emit('favorite-change', {
      id: props.image.id,
      is_favorited: !!res.is_favorited,
      favorites_count: res.favorites_count,
    })
  } catch {
    // http 层已提示
  } finally {
    favBusy.value = false
  }
}
</script>

<style lang="scss" scoped>
.card {
  position: absolute;
  overflow: hidden;
  border-radius: $radius-card;
  background: $color-bg-card;
  box-shadow: $shadow-card;
  cursor: pointer;
  // 保留 transform 过渡：v-tilt 启用时会把 transition 临时置 none 逐帧写 transform，
  // 未启用（触屏 / 系统减少动效）时靠这条过渡完成 hover 抬升与复位
  transition: transform 0.24s cubic-bezier(0.22, 0.61, 0.36, 1), box-shadow 0.24s ease;

  // 高光层：跟随指针的白光斑（--mx / --my 由 v-tilt 写入）。
  // 用中性白光而不是彩色光，避免「AI 感」。
  &::after {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.22s ease;
    background: radial-gradient(
      220px circle at var(--mx, 50%) var(--my, 50%),
      rgba(255, 255, 255, 0.22),
      rgba(255, 255, 255, 0) 60%
    );
  }

  &:hover {
    transform: translateY(-3px);
    box-shadow: $shadow-hover;

    &::after {
      opacity: 1;
    }

    .card__img {
      transform: scale(1.04);
    }

    .card__overlay {
      opacity: 1;
      transform: translateY(0);
    }

    .card__fav {
      opacity: 1;
    }
  }
}

// 倾斜进行中：提前提升合成层，避免逐帧改 transform 触发重绘
.card.is-tilting {
  will-change: transform;
}

.card__media {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.card__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0;
  transition: opacity 0.35s ease, transform 0.35s ease;
}

.card__img.is-loaded {
  opacity: 1;
}

.card__overlay {
  position: absolute;
  inset: auto 0 0 0;
  padding: 30px 12px 10px;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.72), rgba(0, 0, 0, 0));
  opacity: 0;
  transform: translateY(6px);
  transition: opacity 0.22s ease, transform 0.22s ease;
}

.card__title {
  font-size: 13px;
  font-weight: 600;
  color: #fff;
  line-height: 1.35;

  @include ellipsis;
}

.card__meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 6px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.86);
}

.card__author {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.card__avatar {
  flex: none;
  border: 1px solid rgba(255, 255, 255, 0.55);
  background: rgba(255, 255, 255, 0.22);
  color: #fff;
  font-size: 10px;
}

.card__author-name {
  min-width: 0;

  @include ellipsis;
}

// 白色药丸下载按钮，压在渐变信息条上，和照片形成清晰对比
.card__download {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: none;
  padding: 4px 10px;
  border: none;
  border-radius: 980px;
  background: rgba(255, 255, 255, 0.92);
  color: $color-text;
  font-size: 11px;
  font-weight: 500;
  line-height: 1.4;
  cursor: pointer;
  transition: background-color 0.18s ease;

  &:hover {
    background: #ffffff;
  }

  &:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .el-icon {
    font-size: 12px;
  }
}

.card__fav {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.82);
  color: $color-text;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s ease, color 0.2s ease, background 0.2s ease;

  &:hover {
    background: #ffffff;
    color: $color-primary;
  }

  &.is-on {
    opacity: 1;
    color: $color-primary;
  }
}

.card__badge {
  position: absolute;
  top: 8px;
  left: 8px;
  padding: 1px 6px;
  border-radius: 980px;
  background: rgba(255, 255, 255, 0.9);
  color: $color-text;
  font-size: 11px;
  line-height: 1.5;
}

.card__shimmer {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    100deg,
    rgba(255, 255, 255, 0) 30%,
    rgba(255, 255, 255, 0.5) 50%,
    rgba(255, 255, 255, 0) 70%
  );
  background-size: 200% 100%;
  animation: shimmer 1.3s infinite;
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