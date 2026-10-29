<template>
  <div>
    <div class="page-head">
      <div>
        <div class="page-head__title">Images</div>
        <div class="page-head__desc">All images, including those awaiting review and taken down. Take down, restore, or retry processing</div>
      </div>
      <el-button :loading="loading" @click="load">Refresh</el-button>
    </div>

    <div class="u-card">
      <div class="toolbar u-filter-grid">
        <GlideSelect
          v-model="filters.audit_status"
          block
          clearable
          placeholder="Audit status"
          :options="AUDIT_STATUS_OPTIONS"
          aria-label="Filter by audit status"
          @change="reload"
        />

        <GlideSelect
          v-model="filters.process_status"
          block
          clearable
          placeholder="Processing status"
          :options="PROCESS_STATUS_OPTIONS"
          aria-label="Filter by processing status"
          @change="reload"
        />

        <GlideSelect
          v-model="filters.source"
          block
          clearable
          placeholder="All sources"
          :options="SOURCE_OPTIONS"
          aria-label="Filter by source"
          @change="reload"
        />

        <GlideSelect
          v-model="filters.taken_down"
          block
          clearable
          placeholder="Availability"
          :options="TAKEN_DOWN_OPTIONS"
          aria-label="Filter by availability"
          @change="reload"
        />

        <el-input
          v-model="filters.q"
          placeholder="Search titles or creators"
          clearable
          @keyup.enter="reload"
          @clear="reload"
        />
      </div>

      <el-table v-loading="loading" :data="rows" style="width: 100%">
        <el-table-column label="Image" min-width="240">
          <template #default="{ row }">
            <div class="cell-work">
              <img :src="row.thumb_url" class="cell-work__thumb" :alt="row.title" @click="open(row.id)" />
              <div class="cell-work__body">
                <div class="cell-work__title">
                  {{ row.title }}
                  <span v-if="row.is_deleted" class="cell-work__flag">Taken down</span>
                </div>
                <div class="cell-work__meta">{{ row.owner_name }}</div>
              </div>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="Category" width="110">
          <template #default="{ row }">
            <span class="u-text-secondary">{{ row.category_name || 'Uncategorized' }}</span>
          </template>
        </el-table-column>

        <el-table-column label="Status" width="160">
          <template #default="{ row }">
            <div class="cell-status">
              <StatusTag :status="row.audit_status" />
              <StatusTag :status="row.process_status" kind="process" />
            </div>
          </template>
        </el-table-column>

        <el-table-column label="Source" width="80">
          <template #default="{ row }">
            <span class="u-text-secondary">{{ row.source === 'official' ? 'Official' : 'User' }}</span>
          </template>
        </el-table-column>

        <el-table-column label="Created at" width="140">
          <template #default="{ row }">
            <span class="u-text-muted">{{ formatDateTime(row.created_at) }}</span>
          </template>
        </el-table-column>

        <el-table-column label="Actions" width="200" align="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="open(row.id)">View</el-button>
            <el-button
              v-if="row.process_status === 'failed'"
              link
              type="warning"
              @click="onReprocess(row)"
            >
              Retry
            </el-button>
            <el-button v-if="row.is_deleted" link type="success" @click="onRestore(row)">
              Restore
            </el-button>
            <el-button v-else link type="danger" @click="onTakedown(row)">Take down</el-button>
            <el-button link type="danger" @click="onDelete(row)">Delete</el-button>
          </template>
        </el-table-column>

        <template #empty>
          <EmptyState compact title="No matching images" description="Try different filters" />
        </template>
      </el-table>

      <Pagination v-model:page="page" :size="size" :total="total" @change="load" />
    </div>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'

import EmptyState from '@/components/common/EmptyState.vue'
import GlideSelect from '@/components/common/GlideSelect.vue'
import Pagination from '@/components/common/Pagination.vue'
import StatusTag from '@/components/common/StatusTag.vue'
import {
  adminDeleteImage,
  adminListImages,
  reprocessImage,
  restoreImage,
  takedownImage,
} from '@/api/modules/admin'
import { ADMIN_PAGE_SIZE, AUDIT_STATUS_OPTIONS, SOURCE_OPTIONS } from '@/utils/constants'
import { formatDateTime } from '@/utils/format'

const router = useRouter()

const PROCESS_STATUS_OPTIONS = [
  { value: 'queued', label: 'Queued' },
  { value: 'processing', label: 'Processing' },
  { value: 'ready', label: 'Ready' },
  { value: 'failed', label: 'Failed' },
]

const TAKEN_DOWN_OPTIONS = [
  { value: false, label: 'Visible' },
  { value: true, label: 'Taken down' },
]

const rows = ref([])
const total = ref(0)
const page = ref(1)
const size = ref(ADMIN_PAGE_SIZE)
const loading = ref(true)

const filters = reactive({
  audit_status: '',
  process_status: '',
  source: '',
  taken_down: '',
  q: '',
})

function buildParams() {
  const params = { page: page.value, size: size.value }
  if (filters.audit_status) params.audit_status = filters.audit_status
  if (filters.process_status) params.process_status = filters.process_status
  if (filters.source) params.source = filters.source
  if (filters.taken_down !== '' && filters.taken_down !== null) params.taken_down = filters.taken_down
  if (filters.q.trim()) params.q = filters.q.trim()
  return params
}

async function load() {
  loading.value = true
  try {
    const data = await adminListImages(buildParams())
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

function open(id) {
  router.push({ name: 'photo', params: { id } })
}

async function onTakedown(row) {
  let reason = ''
  try {
    const { value } = await ElMessageBox.prompt(
      'This image will be hidden from the public library and search. You can restore it anytime.',
      'Take down image',
      {
        inputPlaceholder: 'Reason (optional, recorded in the audit log)',
        inputValidator: (v) => !v || v.length <= 255 || 'Keep the reason under 255 characters',
        confirmButtonText: 'Take down',
        confirmButtonClass: 'el-button--danger',
      },
    )
    reason = value || ''
  } catch {
    return
  }
  try {
    await takedownImage(row.id, reason)
    ElMessage.success('Taken down')
    load()
  } catch {
    // http 层已提示
  }
}

async function onRestore(row) {
  try {
    await restoreImage(row.id)
    ElMessage.success('Restored')
    load()
  } catch {
    // http 层已提示
  }
}

async function onReprocess(row) {
  try {
    await reprocessImage(row.id)
    ElMessage.success('Added to the processing queue')
    load()
  } catch {
    // http 层已提示
  }
}

async function onDelete(row) {
  try {
    await ElMessageBox.confirm('Delete this image? It will be hidden from the library, and its history is kept.', 'Delete image', {
      type: 'warning',
      confirmButtonText: 'Delete',
      confirmButtonClass: 'el-button--danger',
    })
  } catch {
    return
  }
  try {
    await adminDeleteImage(row.id)
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

.toolbar {
  margin-bottom: 14px;
}

.cell-work {
  display: flex;
  align-items: center;
  gap: 10px;
}

.cell-work__thumb {
  flex: none;
  width: 60px;
  height: 44px;
  object-fit: cover;
  border-radius: $radius-sm;
  background: $color-bg-page;
  cursor: pointer;
}

.cell-work__body {
  min-width: 0;
}

.cell-work__title {
  font-size: 13px;
  color: $color-text;

  @include ellipsis;
}

.cell-work__flag {
  margin-left: 6px;
  padding: 0 6px;
  border-radius: $radius-sm;
  background: rgba(215, 0, 21, 0.08);
  color: $color-danger;
  font-size: 11px;
}

.cell-work__meta {
  font-size: 12px;
  color: $color-text-muted;
}

.cell-status {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
</style>