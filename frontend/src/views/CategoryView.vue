<template>
  <div class="u-page">
    <div class="page-container">
      <div class="page-head">
        <div>
          <div class="page-head__title">{{ category?.name || 'Category' }}</div>
          <div class="page-head__desc">
            {{ category?.description || 'All public images in this category' }}
          </div>
        </div>
        <router-link to="/" class="back">Back to home</router-link>
      </div>

      <ImageFeed
        v-model:order="order"
        :fetcher="listImages"
        :params="{ category: slug }"
        empty-title="No images in this category yet"
        empty-desc="Be the first to contribute here"
      >
        <template #empty-action>
          <el-button type="primary" @click="router.push('/upload')">Upload</el-button>
        </template>
      </ImageFeed>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import ImageFeed from '@/components/image/ImageFeed.vue'
import { listImages } from '@/api/modules/images'
import { getCategory } from '@/api/modules/taxonomy'

const route = useRoute()
const router = useRouter()

const category = ref(null)
const order = ref('latest')

const slug = computed(() => String(route.params.slug || ''))

async function loadMeta() {
  category.value = null
  if (!slug.value) return
  try {
    category.value = await getCategory(slug.value)
  } catch {
    // 分类不存在时标题退化为通用文案，列表自然为空
  }
}

watch(slug, loadMeta, { immediate: true })
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