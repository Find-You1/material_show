<template>
  <div>
    <div class="page-head">
      <div>
        <div class="page-head__title">Audit queue</div>
        <div class="page-head__desc">
          Submissions enter the public library after review. Official content also appears in this queue
        </div>
      </div>
      <el-button :loading="loading" @click="load">Refresh</el-button>
    </div>

    <div class="u-card">
      <div class="toolbar u-filter-grid">
        <RubberSegment
          v-model="status"
          class="audit-status"
          :items="statusTabs"
          size="sm"
          aria-label="Filter by status"
          @change="reload"
        />

        <GlideSelect
          v-model="source"
          block
          clearable
          placeholder="All sources"
          :options="SOURCE_OPTIONS"
          aria-label="Filter by source"
          @change="reload"
        />

        <el-input
          v-model="keyword"
          placeholder="Search titles or creators"
          clearable
          @keyup.enter="reload"
          @clear="reload"
        />
      </div>

      <el-table v-loading="loading" :data="rows" style="width: 100%">
        <el-table-column label="Image" min-width="260">
          <template #default="{ row }">
            <div class="cell-work">
              <img :src="row.thumb_url" class="cell-work__thumb" :alt="row.title" @click="openDetail(row)" />
              <div class="cell-work__body">
                <div class="cell-work__title">{{ row.title }}</div>
                <div class="cell-work__meta">{{ row.width }} × {{ row.height }}</div>
              </div>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="Source" width="90">
          <template #default="{ row }">
            <span class="u-text-secondary">
              {{ row.source === 'official' ? 'Official' : 'User' }}
            </span>
          </template>
        </el-table-column>

        <el-table-column label="Uploaded by" width="130">
          <template #default="{ row }">
            <span class="u-text-secondary">{{ row.owner_name }}</span>
          </template>
        </el-table-column>

        <el-table-column label="Category" width="110">
          <template #default="{ row }">
            <span class="u-text-secondary">{{ row.category_name || 'Uncategorized' }}</span>
          </template>
        </el-table-column>

        <el-table-column label="Status" width="150">
          <template #default="{ row }">
            <div class="cell-status">
              <StatusTag :status="row.audit_status" />
              <StatusTag :status="row.process_status" kind="process" />
            </div>
          </template>
        </el-table-column>

        <el-table-column label="Created at" width="140">
          <template #default="{ row }">
            <span class="u-text-muted">{{ formatDateTime(row.created_at) }}</span>
          </template>
        </el-table-column>

        <el-table-column label="Actions" width="180" align="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openDetail(row)">Details</el-button>
            <el-button
              link
              type="success"
              :disabled="row.audit_status === 'approved'"
              @click="onApprove(row)"
            >
              Approve
            </el-button>
            <el-button
              link
              type="danger"
              :disabled="row.audit_status === 'rejected'"
              @click="openReject(row)"
            >
              Reject
            </el-button>
          </template>
        </el-table-column>

        <template #empty>
          <EmptyState compact :title="emptyTitle" description="The queue is clear" />
        </template>
      </el-table>

      <Pagination v-model:page="page" :size="size" :total="total" @change="load" />
    </div>

    <!-- 驳回 -->
    <el-dialog v-model="rejectVisible" title="Reject image" width="420px">
      <p class="reject__tip">The creator will see this reason. Describe what needs to change</p>
      <el-form label-position="top">
        <el-form-item label="Reason">
          <el-input
            v-model="rejectReason"
            type="textarea"
            :rows="3"
            maxlength="255"
            show-word-limit
            placeholder="e.g. The image doesn't match the title. Add an accurate description."
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="rejectVisible = false">Cancel</el-button>
        <el-button type="danger" :loading="acting" @click="confirmReject">Reject image</el-button>
      </template>
    </el-dialog>

    <!-- 详情 -->
    <el-drawer v-model="drawerVisible" title="Image details" size="520px">
      <div v-if="detail" class="drawer">
        <img :src="detail.preview_url" class="drawer__img" :alt="detail.title" />
        <div class="drawer__title">{{ detail.title }}</div>
        <p v-if="detail.description" class="drawer__desc">{{ detail.description }}</p>

        <div class="drawer__row">
          <StatusTag v-if="detail.audit_status" :status="detail.audit_status" />
          <StatusTag v-if="detail.process_status" :status="detail.process_status" kind="process" />
        </div>

        <el-descriptions :column="1" size="small" border class="u-mt-16">
          <el-descriptions-item label="Uploaded by">{{ detail.owner.nickname || detail.owner.username }}</el-descriptions-item>
          <el-descriptions-item label="Dimensions">{{ detail.width }} × {{ detail.height }}</el-descriptions-item>
          <el-descriptions-item label="Format">
            {{ (detail.format || '').toUpperCase() }} · {{ formatFileSize(detail.file_size) }}
          </el-descriptions-item>
          <el-descriptions-item label="Category">
            {{ detail.category?.name || 'Uncategorized' }}
          </el-descriptions-item>
          <el-descriptions-item label="Tags">
            {{ detail.tags?.length ? detail.tags.join(', ') : 'None' }}
          </el-descriptions-item>
          <el-descriptions-item v-if="detail.reject_reason" label="Rejection reason">
            <span class="u-text-danger">{{ detail.reject_reason }}</span>
          </el-descriptions-item>
        </el-descriptions>

        <div class="u-section-title u-mt-24 u-mb-12">Review history</div>
        <el-timeline>
          <el-timeline-item
            v-for="log in logs"
            :key="log.id"
            :timestamp="formatDateTime(log.created_at)"
            placement="top"
          >
            <div class="log__action">{{ ACTION_LABELS[log.action] || log.action }}</div>
            <div v-if="log.reason" class="log__reason">{{ log.reason }}</div>
          </el-timeline-item>
          <el-timeline-item v-if="!logs.length" timestamp="-" placement="top">
            No review activity yet
          </el-timeline-item>
        </el-timeline>
      </div>
    </el-drawer>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'

import EmptyState from '@/components/common/EmptyState.vue'
import GlideSelect from '@/components/common/GlideSelect.vue'
import Pagination from '@/components/common/Pagination.vue'
import RubberSegment from '@/components/common/RubberSegment.vue'
import StatusTag from '@/components/common/StatusTag.vue'
import {
  approveImage,
  getAuditDetail,
  getAuditLogs,
  listAuditQueue,
  rejectImage,
} from '@/api/modules/admin'
import { ADMIN_PAGE_SIZE, SOURCE_OPTIONS } from '@/utils/constants'
import { useAdminStore } from '@/stores/admin'
import { formatDateTime, formatFileSize } from '@/utils/format'

const admin = useAdminStore()

const ACTION_LABELS = {
  approve: 'Approved',
  reject: 'Rejected',
  takedown: 'Taken down',
  restore: 'Restored',
  resubmit: 'Resubmitted by creator',
  edit: 'Details edited',
}

const rows = ref([])
const total = ref(0)
const page = ref(1)
const size = ref(ADMIN_PAGE_SIZE)
const status = ref('pending')
const statusTabs = [
  { value: 'pending', label: 'Pending review' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'all', label: 'All' },
]
const source = ref('')
const keyword = ref('')
const loading = ref(true)
const acting = ref(false)

const rejectVisible = ref(false)
const rejectReason = ref('')
const rejectTarget = ref(null)

const drawerVisible = ref(false)
const detail = ref(null)
const logs = ref([])

const emptyTitle = computed(() => (status.value === 'pending' ? 'Nothing awaiting review' : 'No matching records'))

async function load() {
  loading.value = true
  try {
    const data = await listAuditQueue({
      status: status.value,
      source: source.value || undefined,
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

async function onApprove(row) {
  acting.value = true
  try {
    await approveImage(row.id)
    ElMessage.success('Approved. The image is now public.')
    load()
    // 待审数变了，顺手把侧栏红点对到真值，免得还要手动刷页面
    admin.refreshPending()
  } catch {
    // http 层已提示
  } finally {
    acting.value = false
  }
}

function openReject(row) {
  rejectTarget.value = row
  rejectReason.value = ''
  rejectVisible.value = true
}

async function confirmReject() {
  const reason = rejectReason.value.trim()
  if (!reason) {
    ElMessage.warning('Add a reason for rejecting')
    return
  }
  acting.value = true
  try {
    await rejectImage(rejectTarget.value.id, reason)
    ElMessage.success('Rejected')
    rejectVisible.value = false
    load()
    // 驳回同样会减少待审数，红点一起更新
    admin.refreshPending()
  } catch {
    // http 层已提示
  } finally {
    acting.value = false
  }
}

async function openDetail(row) {
  drawerVisible.value = true
  detail.value = null
  logs.value = []
  try {
    const [d, l] = await Promise.all([getAuditDetail(row.id), getAuditLogs(row.id)])
    detail.value = d
    logs.value = l || []
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

.cell-work__meta {
  font-size: 12px;
  color: $color-text-muted;
}

.cell-status {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.reject__tip {
  margin-bottom: 12px;
  font-size: 12px;
  color: $color-text-secondary;
}

.drawer__img {
  width: 100%;
  max-height: 320px;
  object-fit: contain;
  border-radius: $radius-base;
  background: $color-bg-page;
}

.drawer__title {
  margin-top: 14px;
  font-size: 16px;
  font-weight: 700;
  color: $color-text;
}

.drawer__desc {
  margin-top: 6px;
  font-size: 13px;
  line-height: 1.7;
  color: $color-text-secondary;
  white-space: pre-wrap;
}

.drawer__row {
  display: flex;
  gap: 6px;
  margin-top: 12px;
}

.log__action {
  font-size: 13px;
  color: $color-text;
}

.log__reason {
  margin-top: 2px;
  font-size: 12px;
  color: $color-text-secondary;
}
</style>