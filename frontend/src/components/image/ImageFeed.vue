<template>
  <div>
    <FilterBar
      :total="total"
      :order="order"
      :order-options="orderOptions"
      :chips="chips"
      :center-order="!slots.filters"
      @update:order="$emit('update:order', $event)"
      @remove-filter="$emit('remove-filter', $event)"
      @reset="$emit('reset')"
    >
      <slot name="filters" />
    </FilterBar>

    <!-- 只在首次加载（还没有任何卡片）时铺骨架屏。
         切换筛选/标签时保留旧卡片直到新数据到达，避免整片瀑布流被拆掉重建带来的闪白与卡顿。 -->
    <ImageSkeleton v-if="loadingFirst && !images.length" :count="12" />

    <MasonryGrid v-else-if="images.length" :items="images" @favorite-change="onFavoriteChange" />

    <EmptyState v-else :title="emptyTitle" :description="emptyDesc">
      <slot name="empty-action" />
    </EmptyState>

    <div ref="sentinel" class="sentinel">
      <span v-if="scrollLoading" class="u-label">Loading…</span>
      <span v-else-if="finished && images.length" class="u-label">You have reached the end</span>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch, useSlots } from 'vue'

import FilterBar from '@/components/common/FilterBar.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import ImageSkeleton from '@/components/image/ImageSkeleton.vue'
import MasonryGrid from '@/components/image/MasonryGrid.vue'
import { useInfiniteScroll } from '@/composables/useInfiniteScroll'
import { ORDER_OPTIONS, PAGE_SIZE } from '@/utils/constants'

const props = defineProps({
  /** (params) => Promise<{items,total}>，如 listImages / searchImages */
  fetcher: { type: Function, required: true },
  /** 额外查询参数：category / tag / owner / q / tags 等 */
  params: { type: Object, default: () => ({}) },
  order: { type: String, default: 'latest' },
  orderOptions: { type: Array, default: () => ORDER_OPTIONS },
  size: { type: Number, default: PAGE_SIZE },
  chips: { type: Array, default: () => [] },
  emptyTitle: { type: String, default: 'No images found' },
  emptyDesc: { type: String, default: 'Try another search or adjust your filters.' },
  /** 收藏列表用：取消收藏后把卡片从当前列表移除 */
  removeOnUnfavorite: { type: Boolean, default: false },
})

const emit = defineEmits(['update:order', 'remove-filter', 'reset', 'loaded'])

// 调用页没给 #filters 时，筛选条里就只有「张图片 + 排序」，排序控件居中
const slots = useSlots()

const images = ref([])
const total = ref(0)
const page = ref(1)
const loadingFirst = ref(true)
const finished = ref(false)
const sentinel = ref(null)

// params / order 任一变化就重新加载（筛选条件变了必然要重来）
const paramKey = computed(() => JSON.stringify({ ...props.params, order: props.order }))

// 并发控制：首屏加载与无限滚动哨兵可能几乎同时触发，
// 若不加锁，后返回的「追加」会跑在「重置」之后，同一页数据被写两遍
// （表现就是卡片成倍重复）。seq 用来丢弃过期请求的结果。
let seq = 0
let inFlight = false

async function load(reset = false) {
  if (reset) {
    page.value = 1
    finished.value = false
  } else if (finished.value || inFlight) {
    return
  }

  const mySeq = ++seq
  inFlight = true
  const targetPage = page.value

  try {
    const data = await props.fetcher({
      ...props.params,
      order: props.order,
      page: targetPage,
      size: props.size,
    })
    // 已被更新的一次加载取代，直接丢弃这次结果
    if (mySeq !== seq) return

    const items = data?.items || []
    images.value = reset ? items : images.value.concat(items)
    total.value = data?.total || 0
    finished.value = images.value.length >= total.value || items.length < props.size
    if (!finished.value) page.value = targetPage + 1
    emit('loaded', total.value)
  } finally {
    if (mySeq === seq) inFlight = false
  }
}

async function reload() {
  loadingFirst.value = true
  try {
    await load(true)
  } catch {
    images.value = []
    total.value = 0
  } finally {
    loadingFirst.value = false
  }
}

const { loading: scrollLoading } = useInfiniteScroll(sentinel, () => load(false), {
  disabled: () => finished.value || loadingFirst.value,
})

function onFavoriteChange({ id, is_favorited, favorites_count }) {
  if (props.removeOnUnfavorite && !is_favorited) {
    images.value = images.value.filter((i) => i.id !== id)
    total.value = Math.max(0, total.value - 1)
    return
  }
  const target = images.value.find((i) => i.id === id)
  if (target) {
    target.is_favorited = is_favorited
    target.favorites_count = favorites_count
  }
}

watch(paramKey, reload)
onMounted(reload)

defineExpose({ reload, images, total })
</script>

<style lang="scss" scoped>
.sentinel {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 40px;
  padding-top: 16px;
}
</style>