<template>
  <div>
    <div class="page-head">
      <div>
        <div class="page-head__title">Tags</div>
        <div class="page-head__desc">
          Tags are included in full-text search. Renaming one updates every linked image automatically
        </div>
      </div>
      <el-button :loading="loading" @click="load">Refresh</el-button>
    </div>

    <div class="u-card">
      <div class="toolbar u-filter-grid">
        <el-input
          v-model="keyword"
          placeholder="Search tag names"
          clearable
          @keyup.enter="reload"
          @clear="reload"
        />
        <div class="toolbar__hint u-label">Sorted by image count, highest first</div>
      </div>

      <el-table v-loading="loading" :data="rows" style="width: 100%">
        <el-table-column prop="name" label="Name" min-width="160" />
        <el-table-column label="Slug" min-width="160">
          <template #default="{ row }">
            <span class="u-mono u-text-muted">{{ row.slug }}</span>
          </template>
        </el-table-column>
        <el-table-column label="Images" width="110">
          <template #default="{ row }">
            <span class="u-value">{{ row.image_count }}</span>
          </template>
        </el-table-column>
        <el-table-column label="Actions" width="150" align="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="onRename(row)">Rename</el-button>
            <el-button link type="danger" @click="onDelete(row)">Delete</el-button>
          </template>
        </el-table-column>

        <template #empty>
          <EmptyState compact title="No matching tags" description="Tags are created automatically when people upload" />
        </template>
      </el-table>

      <Pagination v-model:page="page" :size="size" :total="total" @change="load" />
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'

import EmptyState from '@/components/common/EmptyState.vue'
import Pagination from '@/components/common/Pagination.vue'
import { adminDeleteTag, adminListTags, adminUpdateTag } from '@/api/modules/taxonomy'

const rows = ref([])
const total = ref(0)
const page = ref(1)
const size = ref(50)
const keyword = ref('')
const loading = ref(true)

async function load() {
  loading.value = true
  try {
    const data = await adminListTags({
      q: keyword.value.trim() || undefined,
      page: page.value,
      size: size.value,
    })
    rows.value = data.items || []
    total.value = data.total || 0
  } catch {
    rows.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}

function reload() {
  page.value = 1
  load()
}

async function onRename(row) {
  let name = ''
  try {
    const { value } = await ElMessageBox.prompt('The new name will update search content for every linked image', 'Rename tag', {
      inputValue: row.name,
      inputValidator: (v) => Boolean(v && v.trim()) || 'Tag name is required',
      confirmButtonText: 'Save',
    })
    name = (value || '').trim()
  } catch {
    return
  }
  try {
    await adminUpdateTag(row.id, { name })
    ElMessage.success('Renamed')
    load()
  } catch {
    // http 层已提示
  }
}

async function onDelete(row) {
  try {
    await ElMessageBox.confirm(
      `Delete ${row.name}? It will be unlinked from ${row.image_count} images. The images themselves are not affected.`,
      'Delete tag',
      { type: 'warning', confirmButtonText: 'Delete', confirmButtonClass: 'el-button--danger' },
    )
  } catch {
    return
  }
  try {
    await adminDeleteTag(row.id)
    ElMessage.success('Deleted')
    if (rows.value.length === 1 && page.value > 1) page.value -= 1
    load()
  } catch {
    // http 层已提示
  }
}

onMounted(load)
</script>

<style lang="scss" scoped>
// 面板质感统一走全局 .u-card（solid 卡片），这页只补自己的内边距
.u-card {
  padding: 16px 18px 8px;
}

.toolbar {
  margin-bottom: 14px;
}

.toolbar__hint {
  align-self: center;
}
</style>