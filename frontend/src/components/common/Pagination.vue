<template>
  <div v-if="total > size" class="pagination">
    <el-pagination
      :current-page="page"
      :page-size="size"
      :total="total"
      :pager-count="pagerCount"
      layout="prev, pager, next, total"
      background
      @current-change="onChange"
    />
  </div>
</template>

<script setup>
const props = defineProps({
  page: { type: Number, default: 1 },
  size: { type: Number, default: 20 },
  total: { type: Number, default: 0 },
  pagerCount: { type: Number, default: 7 },
})

const emit = defineEmits(['update:page', 'change'])

function onChange(next) {
  emit('update:page', next)
  emit('change', next)
}
</script>

<style lang="scss" scoped>
.pagination {
  display: flex;
  justify-content: center;
  padding-block: 24px 8px;
}
</style>