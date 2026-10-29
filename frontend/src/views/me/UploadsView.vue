<template>
  <div class="u-page">
    <div class="page-container">
      <div class="page-head">
        <div>
          <div class="page-head__title">My uploads</div>
          <div class="page-head__desc">Manage your submissions and track review and processing status</div>
        </div>
        <el-button type="primary" @click="router.push('/upload')">Upload new work</el-button>
      </div>

      <!-- 统计 -->
      <div class="stats u-mb-24">
        <StatNumber :value="stats.upload_count" label="Uploads" />
        <StatNumber
          :value="stats.approved_count"
          label="Live"
          :class="{ 'stat--ok': stats.approved_count > 0 }"
        />
        <StatNumber
          :value="stats.pending_count"
          label="In review"
          :class="{ 'stat--warn': stats.pending_count > 0 }"
        />
        <StatNumber
          :value="stats.rejected_count"
          label="Rejected"
          :class="{ 'stat--bad': stats.rejected_count > 0 }"
        />
        <StatNumber :value="stats.favorites_count" label="Saves" />
        <StatNumber :value="stats.downloads_total" label="Downloads" />
      </div>

      <div class="u-panel list-wide">
        <div class="toolbar">
          <RubberSegment
            v-model="status"
            :items="statusTabs"
            size="sm"
            aria-label="Filter by review status"
            @change="onStatusChange"
          />
        </div>

        <el-table v-loading="loading" :data="rows" style="width: 100%">
          <el-table-column label="Work" min-width="240">
            <template #default="{ row }">
              <div class="cell-work">
                <img :src="row.thumb_url" class="cell-work__thumb" :alt="row.title" />
                <div class="cell-work__body">
                  <div class="cell-work__title">{{ row.title }}</div>
                  <div class="cell-work__meta">
                    {{ row.width }} × {{ row.height }}
                    <template v-if="row.category"> · {{ row.category.name }}</template>
                  </div>
                </div>
              </div>
            </template>
          </el-table-column>

          <el-table-column label="Review status" width="150">
            <template #default="{ row }">
              <StatusTag :status="row.audit_status" />
              <div v-if="row.reject_reason" class="cell-reason">{{ row.reject_reason }}</div>
            </template>
          </el-table-column>

          <el-table-column label="Processing" width="110">
            <template #default="{ row }">
              <StatusTag :status="row.process_status" kind="process" />
            </template>
          </el-table-column>

          <el-table-column label="Submitted" width="140">
            <template #default="{ row }">
              <span class="u-text-muted">{{ formatDateTime(row.created_at) }}</span>
            </template>
          </el-table-column>

          <el-table-column label="Actions" width="230" align="right">
            <template #default="{ row }">
              <el-button link type="primary" @click="openDetail(row)">View</el-button>
              <el-button
                v-if="row.audit_status !== 'approved'"
                link
                type="primary"
                @click="openEdit(row)"
              >
                Edit
              </el-button>
              <el-button
                v-if="row.audit_status === 'rejected'"
                link
                type="primary"
                @click="onResubmit(row)"
              >
                Resubmit
              </el-button>
              <el-button
                v-if="row.process_status === 'failed'"
                link
                type="warning"
                @click="onReprocess(row)"
              >
                Retry
              </el-button>
              <el-button link type="danger" @click="onDelete(row)">Delete</el-button>
            </template>
          </el-table-column>

          <template #empty>
            <EmptyState
              compact
              title="No uploads yet"
              description="Upload your first work to have it shown in the public gallery once approved"
            >
              <el-button type="primary" @click="router.push('/upload')">Upload</el-button>
            </EmptyState>
          </template>
        </el-table>

        <Pagination v-model:page="page" :size="size" :total="total" @change="load" />
      </div>
    </div>

    <!-- 编辑弹窗 -->
    <el-dialog v-model="editVisible" title="Edit work details" width="520px">
      <el-form :model="editForm" label-position="top">
        <el-form-item label="Title">
          <el-input v-model="editForm.title" :maxlength="TITLE_MAX" show-word-limit />
        </el-form-item>
        <el-form-item label="Description">
          <el-input
            v-model="editForm.description"
            type="textarea"
            :rows="3"
            :maxlength="DESC_MAX"
            show-word-limit
          />
        </el-form-item>
        <el-form-item label="Category">
          <GlideSelect
            v-model="editForm.category_id"
            block
            clearable
            placeholder="Select a category"
            :options="categoryOptions"
            aria-label="Select a category"
          />
        </el-form-item>
        <el-form-item label="Tags">
          <el-input v-model="editForm.tags" placeholder="Separate tags with commas" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">Cancel</el-button>
        <el-button type="primary" :loading="saving" @click="saveEdit">Save changes</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'

import EmptyState from '@/components/common/EmptyState.vue'
import GlideSelect from '@/components/common/GlideSelect.vue'
import Pagination from '@/components/common/Pagination.vue'
import RubberSegment from '@/components/common/RubberSegment.vue'
import StatNumber from '@/components/common/StatNumber.vue'
import StatusTag from '@/components/common/StatusTag.vue'
import {
  deleteMyUpload,
  listMyUploads,
  reprocessMyUpload,
  resubmitMyUpload,
  updateMyUpload,
} from '@/api/modules/images'
import { getMeStats } from '@/api/modules/auth'
import { getCategories } from '@/api/modules/taxonomy'
import { ADMIN_PAGE_SIZE, DESC_MAX, TITLE_MAX, UPLOAD_MAX_TAGS } from '@/utils/constants'
import { formatDateTime, joinTags, parseTags } from '@/utils/format'

const router = useRouter()

const rows = ref([])
const total = ref(0)
const page = ref(1)
const size = ref(ADMIN_PAGE_SIZE)
const status = ref('')
const statusTabs = [
  { value: '', label: 'All' },
  { value: 'pending', label: 'In review' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
]
const loading = ref(true)
const categories = ref([])
const categoryOptions = computed(() => categories.value.map((c) => ({ value: c.id, label: c.name })))

const stats = reactive({
  upload_count: 0,
  approved_count: 0,
  pending_count: 0,
  rejected_count: 0,
  favorites_count: 0,
  downloads_total: 0,
})

const editVisible = ref(false)
const saving = ref(false)
const editForm = reactive({ id: null, title: '', description: '', category_id: null, tags: '' })

async function load() {
  loading.value = true
  try {
    const data = await listMyUploads({
      status: status.value || undefined,
      page: page.value,
      size: size.value,
    })
    rows.value = data.items || []
    total.value = data.total || 0
  } finally {
    loading.value = false
  }
}

async function loadStats() {
  try {
    Object.assign(stats, await getMeStats())
  } catch {
    // 统计失败不影响列表
  }
}

function onStatusChange() {
  page.value = 1
  load()
}

function openDetail(row) {
  router.push({ name: 'photo', params: { id: row.id } })
}

function openEdit(row) {
  editForm.id = row.id
  editForm.title = row.title
  editForm.description = row.description || ''
  editForm.category_id = row.category?.id ?? null
  editForm.tags = joinTags(row.tags)
  editVisible.value = true
}

async function saveEdit() {
  if (!editForm.title.trim()) {
    ElMessage.warning('Enter a title')
    return
  }
  saving.value = true
  try {
    await updateMyUpload(editForm.id, {
      title: editForm.title.trim(),
      description: editForm.description.trim(),
      category_id: editForm.category_id,
      tags: parseTags(editForm.tags, UPLOAD_MAX_TAGS),
    })
    ElMessage.success('Changes saved')
    editVisible.value = false
    load()
    loadStats()
  } catch {
    // http 层已提示
  } finally {
    saving.value = false
  }
}

async function onResubmit(row) {
  try {
    await ElMessageBox.confirm('This work will return to the review queue. Are you sure?', 'Resubmit', {
      type: 'warning',
    })
  } catch {
    return
  }
  try {
    await resubmitMyUpload(row.id)
    ElMessage.success('Resubmitted. It is back in the review queue.')
    load()
    loadStats()
  } catch {
    // http 层已提示
  }
}

async function onReprocess(row) {
  try {
    await reprocessMyUpload(row.id)
    ElMessage.success('Added to the processing queue')
    load()
  } catch {
    // http 层已提示
  }
}

async function onDelete(row) {
  try {
    await ElMessageBox.confirm(`“${row.title}” will no longer be shown. Are you sure?`, 'Delete work', {
      type: 'warning',
      confirmButtonText: 'Delete',
      confirmButtonClass: 'el-button--danger',
    })
  } catch {
    return
  }
  try {
    await deleteMyUpload(row.id)
    ElMessage.success('Deleted')
    if (rows.value.length === 1 && page.value > 1) page.value -= 1
    load()
    loadStats()
  } catch {
    // http 层已提示
  }
}

onMounted(async () => {
  load()
  loadStats()
  try {
    categories.value = await getCategories(false)
  } catch {
    // 忽略
  }
})
</script>

<style lang="scss" scoped>
.stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 4px;
  padding: 16px 20px;
  @include panel-glass;

  // 六项之间拉发丝分隔线，比露白更有「数据条」的分量感
  :deep(.stat) {
    padding: 2px 16px;
    border-left: 1px solid $color-border;

    &:first-child {
      padding-left: 0;
      border-left: none;
    }
  }

  :deep(.stat__value) {
    font-size: 20px;
    letter-spacing: -0.3px;
    color: $color-text;
  }

  :deep(.stat__label) {
    margin-top: 2px;
  }

  // 有量才上色：全是 0 的时候整条彩字反而是噪声
  :deep(.stat--ok .stat__value) {
    color: $color-success;
  }

  :deep(.stat--warn .stat__value) {
    color: $color-warning;
  }

  :deep(.stat--bad .stat__value) {
    color: $color-danger;
  }
}

// 玻璃质感统一走全局 .u-panel，这页只补自己的内边距与「表格铺玻璃」的覆盖
.u-panel {
  padding: 16px 18px 10px;
  // 表格铺在玻璃上：把 Element 自己的底色与边框线让出来
  :deep(.el-table) {
    --el-table-bg-color: transparent;
    --el-table-tr-bg-color: transparent;
    --el-table-header-bg-color: #{$color-bg-page};
    --el-table-row-hover-bg-color: rgba(0, 113, 227, 0.04);
    --el-table-border-color: $color-border;
  }

  // 这两条是表格自带的右/下底线，跟面板边框叠在一起会显脏
  :deep(.el-table::before),
  :deep(.el-table__inner-wrapper::before) {
    display: none;
  }

  // 表头退成次级信息，让「作品」那一列成为视觉主角
  :deep(.el-table th.el-table__cell) {
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.2px;
    color: $color-text-secondary;
  }

  :deep(.el-table td.el-table__cell) {
    padding-top: 10px;
    padding-bottom: 10px;
    border-bottom-color: $color-border;
  }

  :deep(.el-table__row) {
    transition: background-color 0.16s ease;
  }

  // 悬停时缩略图轻微推近，行整体有被「拿起来」的反馈
  :deep(.el-table__row:hover .cell-work__thumb) {
    transform: scale(1.05);
  }
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
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
  border-radius: $radius-base;
  border: 1px solid $color-border;
  background: $color-bg-hover;
  transition: transform 0.2s ease;
}

.cell-work__body {
  min-width: 0;
}

.cell-work__title {
  font-size: 13px;
  color: $color-text;

  @include ellipsis;
}

.cell-work__meta {
  font-size: 12px;
  color: $color-text-muted;
}

.cell-reason {
  margin-top: 4px;
  font-size: 12px;
  color: $color-danger;
}
</style>