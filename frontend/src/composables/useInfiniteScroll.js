import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

/**
 * 无限滚动：观察底部哨兵，进入视口就加载下一页。
 *
 * @param {import('vue').Ref<HTMLElement|null>} targetRef 哨兵元素
 * @param {() => Promise<void>|void} onLoadMore 加载回调
 * @param {{rootMargin?:string, disabled?:() => boolean}} options
 */
export function useInfiniteScroll(targetRef, onLoadMore, options = {}) {
  const rootMargin = options.rootMargin ?? '600px 0px'
  const loading = ref(false)
  let observer = null

  async function trigger() {
    if (loading.value) return
    if (options.disabled && options.disabled()) return
    loading.value = true
    try {
      await onLoadMore()
    } finally {
      loading.value = false
    }
  }

  function observe() {
    if (observer || !targetRef.value) return
    observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) trigger()
      },
      { rootMargin },
    )
    observer.observe(targetRef.value)
  }

  function disconnect() {
    if (observer) {
      observer.disconnect()
      observer = null
    }
  }

  onMounted(() => {
    // 哨兵是 v-if 控制的，挂载那一刻可能还不存在，watch 兜住
    if (targetRef.value) observe()
  })

  watch(targetRef, (el) => {
    disconnect()
    if (el) observe()
  })

  onBeforeUnmount(disconnect)

  return { loading, trigger, disconnect }
}