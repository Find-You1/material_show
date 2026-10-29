<template>
  <div>
    <div class="page-head">
      <div>
        <div class="page-head__title">Categories</div>
        <div class="page-head__desc">Categories organize navigation and filters in the public library. Deleting one won't delete its images</div>
      </div>
      <el-button type="primary" @click="openCreate">New category</el-button>
    </div>

    <div class="u-card">
      <el-table v-loading="loading" :data="rows" style="width: 100%">
        <el-table-column prop="name" label="Name" min-width="140" />
        <el-table-column label="Slug" min-width="140">
          <template #default="{ row }">
            <span class="u-mono u-text-muted">{{ row.slug }}</span>
          </template>
        </el-table-column>
        <el-table-column label="Description" min-width="220">
          <template #default="{ row }">
            <span class="u-text-secondary">{{ row.description || '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="sort_order" label="Order" width="80" />
        <el-table-column label="Images" width="100">
          <template #default="{ row }">
            <span class="u-value">{{ row.image_count }}</span>
          </template>
        </el-table-column>
        <el-table-column label="Actions" width="140" align="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openEdit(row)">Edit</el-button>
            <el-button link type="danger" @click="onDelete(row)">Delete</el-button>
          </template>
        </el-table-column>

        <template #empty>
          <EmptyState compact title="No categories yet" description="Create one to use it when uploading and browsing" />
        </template>
      </el-table>
    </div>

    <el-dialog v-model="visible" :title="form.id ? 'Edit category' : 'New category'" width="460px">
      <el-form :model="form" label-position="top">
        <el-form-item label="Name">
          <el-input v-model="form.name" maxlength="50" placeholder="e.g. Landscapes" />
        </el-form-item>
        <el-form-item label="Slug (optional)">
          <el-input v-model="form.slug" maxlength="50" placeholder="Leave empty to generate from the name" />
        </el-form-item>
        <el-form-item label="Description">
          <el-input v-model="form.description" type="textarea" :rows="2" maxlength="255" show-word-limit />
        </el-form-item>
        <el-form-item label="Sort order">
          <el-input-number v-model="form.sort_order" :min="0" :max="9999" controls-position="right" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="visible = false">Cancel</el-button>
        <el-button type="primary" :loading="saving" @click="save">Save</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'

import EmptyState from '@/components/common/EmptyState.vue'
import {
  adminCreateCategory,
  adminDeleteCategory,
  adminListCategories,
  adminUpdateCategory,
} from '@/api/modules/taxonomy'

const rows = ref([])
const loading = ref(true)
const visible = ref(false)
const saving = ref(false)

const form = reactive({
  id: null,
  name: '',
  slug: '',
  description: '',
  sort_order: 0,
})

async function load() {
  loading.value = true
  try {
    // size 上限 200，分类数量远小于此，一次取完不做分页
    const data = await adminListCategories({ page: 1, size: 200 })
    rows.value = data.items || []
  } catch {
    rows.value = []
  } finally {
    loading.value = false
  }
}

function openCreate() {
  form.id = null
  form.name = ''
  form.slug = ''
  form.description = ''
  form.sort_order = 0
  visible.value = true
}

function openEdit(row) {
  form.id = row.id
  form.name = row.name
  form.slug = row.slug
  form.description = row.description || ''
  form.sort_order = row.sort_order
  visible.value = true
}

async function save() {
  if (!form.name.trim()) {
    ElMessage.warning('Name is required')
    return
  }
  const payload = {
    name: form.name.trim(),
    description: form.description.trim(),
    sort_order: form.sort_order,
  }
  if (form.slug.trim()) payload.slug = form.slug.trim()

  saving.value = true
  try {
    if (form.id) {
      await adminUpdateCategory(form.id, payload)
      ElMessage.success('Saved')
    } else {
      await adminCreateCategory(payload)
      ElMessage.success('Created')
    }
    visible.value = false
    load()
  } catch {
    // http 层已提示
  } finally {
    saving.value = false
  }
}

async function onDelete(row) {
  try {
    await ElMessageBox.confirm(
      `Delete ${row.name}? Its images will move to Uncategorized. The images themselves are not affected.`,
      'Delete category',
      { type: 'warning', confirmButtonText: 'Delete', confirmButtonClass: 'el-button--danger' },
    )
  } catch {
    return
  }
  try {
    await adminDeleteCategory(row.id)
    ElMessage.success('Deleted')
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
</style>