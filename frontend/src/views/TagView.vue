<template>
  <div class="u-page">
    <div class="page-container">
      <div class="page-head">
        <div>
          <div class="page-head__title">
            Tag: <span class="accent">{{ tag?.name || route.params.slug }}</span>
          </div>
          <div class="page-head__desc">All public images tagged with this tag</div>
        </div>
        <router-link to="/" class="back">Back to home</router-link>
      </div>

      <ImageFeed
        v-model:order="order"
        :fetcher="listImages"
        :params="{ tag: slug }"
        empty-title="No images with this tag yet"
        empty-desc="Try another tag, or add this tag when you upload"
      />
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

import ImageFeed from '@/components/image/ImageFeed.vue'
import { listImages } from '@/api/modules/images'
import { getTag } from '@/api/modules/taxonomy'

const route = useRoute()

const tag = ref(null)
const order = ref('latest')

const slug = computed(() => String(route.params.slug || ''))

watch(
  slug,
  async (value) => {
    tag.value = null
    if (!value) return
    try {
      tag.value = await getTag(value)
    } catch {
      // 标签不存在时用 slug 兜底展示
    }
  },
  { immediate: true },
)
</script>

<style lang="scss" scoped>
.accent {
  color: $color-primary;
}

.back {
  font-size: 12px;
  color: $color-text-secondary;

  &:hover {
    color: $color-primary;
  }
}
</style>