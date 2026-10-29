import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

/**
 * 无跳动瀑布流布局。
 *
 * 关键点：直接用后端返回的 width / height 预算每张卡片的高度，
 * **不等 <img> onload**，所以追加下一页时既有卡片不会重排、页面不会跳动。
 *
 * @param {import('vue').Ref<Array>|(() => Array)} itemsRef 列表数据（每项需含 width/height）
 *        支持传入 ref，也支持传 getter（`() => props.items`）
 * @param {{colMin?:number, gap?:number, minRatio?:number, maxRatio?:number,
 *          fallbackRatio?:number}} options
 */
export function useMasonry(itemsRef, options = {}) {
  // 归一化：ref 与 getter 两种入参都能用
  const getItems = typeof itemsRef === 'function' ? itemsRef : () => itemsRef?.value

  const colMin = options.colMin ?? 240
  const gap = options.gap ?? 16
  // 极端长图/超宽图会毁掉布局，按比例夹住（配合 object-fit: cover 裁切显示）
  const minRatio = options.minRatio ?? 0.45
  const maxRatio = options.maxRatio ?? 1.9
  const fallbackRatio = options.fallbackRatio ?? 0.66

  const containerRef = ref(null)
  const containerWidth = ref(0)
  const columns = ref(1)
  const columnWidth = ref(0)
  const positions = ref([])
  const containerHeight = ref(0)

  let observer = null

  function measure() {
    const el = containerRef.value
    if (!el) return
    const w = el.clientWidth
    if (w !== containerWidth.value) {
      containerWidth.value = w
    }
  }

  function layout() {
    const list = getItems() || []
    const width = containerWidth.value

    if (!width || !list.length) {
      columns.value = width ? Math.max(1, Math.floor((width + gap) / (colMin + gap))) : 1
      columnWidth.value = 0
      positions.value = []
      containerHeight.value = 0
      return
    }

    const cols = Math.max(1, Math.floor((width + gap) / (colMin + gap)))
    const colW = (width - gap * (cols - 1)) / cols

    columns.value = cols
    columnWidth.value = colW

    const heights = new Array(cols).fill(0)
    const next = new Array(list.length)

    for (let i = 0; i < list.length; i += 1) {
      const item = list[i] || {}
      const iw = Number(item.width) || 0
      const ih = Number(item.height) || 0
      let ratio = iw > 0 && ih > 0 ? ih / iw : fallbackRatio
      if (!Number.isFinite(ratio) || ratio <= 0) ratio = fallbackRatio
      ratio = Math.min(maxRatio, Math.max(minRatio, ratio))

      const h = Math.round(colW * ratio)

      // 贪心：放到当前最矮的一列
      let col = 0
      for (let c = 1; c < cols; c += 1) {
        if (heights[c] < heights[col] - 0.5) col = c
      }

      next[i] = {
        left: Math.round(col * (colW + gap)),
        top: Math.round(heights[col]),
        width: Math.round(colW),
        height: h,
      }
      heights[col] += h + gap
    }

    positions.value = next
    containerHeight.value = Math.max(0, Math.max(...heights) - gap)
  }

  // 数据身份变化（长度或 id 序列变化）才重排，避免每次响应式扰动都算一遍
  const signature = computed(() => {
    const list = getItems() || []
    return `${list.length}|${list.map((i) => i?.id ?? '').join(',')}`
  })

  watch([containerWidth, signature], layout, { immediate: true })

  onMounted(() => {
    measure()
    if (typeof ResizeObserver !== 'undefined' && containerRef.value) {
      observer = new ResizeObserver(measure)
      observer.observe(containerRef.value)
    } else {
      window.addEventListener('resize', measure)
    }
    layout()
  })

  onBeforeUnmount(() => {
    if (observer) {
      observer.disconnect()
      observer = null
    } else {
      window.removeEventListener('resize', measure)
    }
  })

  return {
    containerRef,
    positions,
    columns,
    columnWidth,
    containerHeight,
    relayout: layout,
  }
}