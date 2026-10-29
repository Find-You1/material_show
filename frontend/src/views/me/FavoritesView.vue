<template>
  <div class="u-page">
    <div class="page-container">
      <div class="page-head">
        <div>
          <div class="page-head__title">Saved</div>
          <div class="page-head__desc">Everything you saved lives here. Unsave an image and it disappears right away</div>
        </div>
        <router-link to="/" class="back">Discover more</router-link>
      </div>

      <ImageFeed
        :fetcher="fetchFavorites"
        :order-options="[]"
        remove-on-unfavorite
        empty-title="Nothing saved yet"
        empty-desc="Tap the star on any image to save it"
      >
        <template #empty-action>
          <el-button type="primary" @click="router.push('/')">Browse</el-button>
        </template>
      </ImageFeed>
    </div>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router'

import ImageFeed from '@/components/image/ImageFeed.vue'
import { listFavorites } from '@/api/modules/favorites'

const router = useRouter()

// 收藏列表不需要排序与筛选，只透传分页
function fetchFavorites({ page, size }) {
  return listFavorites({ page, size })
}
</script>

<style lang="scss" scoped>
.back {
  font-size: 12px;
  color: $color-text-secondary;

  &:hover {
    color: $color-primary;
  }
}
</style>