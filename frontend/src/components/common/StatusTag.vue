<template>
  <el-tag :type="tagType" size="small" effect="light" round>{{ tagLabel }}</el-tag>
</template>

<script setup>
import { computed } from 'vue'

import {
  auditStatusLabel,
  auditStatusType,
  processStatusLabel,
  processStatusType,
} from '@/utils/constants'

const props = defineProps({
  status: { type: String, default: '' },
  // 'audit' 审核状态 | 'process' 处理状态
  kind: { type: String, default: 'audit' },
})

const tagLabel = computed(() =>
  props.kind === 'process' ? processStatusLabel(props.status) : auditStatusLabel(props.status),
)

const tagType = computed(() =>
  props.kind === 'process' ? processStatusType(props.status) : auditStatusType(props.status),
)
</script>