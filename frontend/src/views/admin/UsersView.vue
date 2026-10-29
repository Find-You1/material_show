<template>
  <div>
    <div class="page-head">
      <div>
        <div class="page-head__title">Users</div>
        <div class="page-head__desc">Manage user roles and account status. For safety, you can't change or delete your own account</div>
      </div>
      <el-button :loading="loading" @click="load">Refresh</el-button>
    </div>

    <div class="u-card">
      <div class="toolbar u-filter-grid">
        <GlideSelect
          v-model="filters.role"
          block
          clearable
          placeholder="All roles"
          :options="ROLE_OPTIONS"
          aria-label="Filter by role"
          @change="reload"
        />

        <GlideSelect
          v-model="filters.is_active"
          block
          clearable
          placeholder="All statuses"
          :options="ACTIVE_OPTIONS"
          aria-label="Filter by status"
          @change="reload"
        />

        <el-input
          v-model="filters.q"
          placeholder="Search names, usernames, or email"
          clearable
          @keyup.enter="reload"
          @clear="reload"
        />
      </div>

      <el-table v-loading="loading" :data="rows" style="width: 100%">
        <el-table-column label="User" min-width="200">
          <template #default="{ row }">
            <div class="cell-user">
              <el-avatar :size="30" :src="row.avatar_url || ''">
                {{ (row.nickname || row.username).slice(0, 1).toUpperCase() }}
              </el-avatar>
              <div>
                <div class="cell-user__name">
                  {{ row.nickname || row.username }}
                  <span v-if="row.id === auth.userId" class="cell-user__self">You</span>
                </div>
                <div class="cell-user__account">@{{ row.username }}</div>
              </div>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="Email" min-width="180">
          <template #default="{ row }">
            <span class="u-text-secondary">{{ row.email }}</span>
          </template>
        </el-table-column>

        <el-table-column label="Role" width="100">
          <template #default="{ row }">
            <el-tag :type="row.role === 'admin' ? 'warning' : 'info'" size="small" effect="light" round>
              {{ row.role === 'admin' ? 'Admin' : 'User' }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="Status" width="90">
          <template #default="{ row }">
            <el-tag :type="row.is_active ? 'success' : 'danger'" size="small" effect="light" round>
              {{ row.is_active ? 'Active' : 'Disabled' }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="Uploads / Public" width="110">
          <template #default="{ row }">
            <span class="u-text-secondary">{{ row.upload_count }} / {{ row.approved_count }}</span>
          </template>
        </el-table-column>

        <el-table-column label="Created at" width="140">
          <template #default="{ row }">
            <span class="u-text-muted">{{ formatDate(row.created_at) }}</span>
          </template>
        </el-table-column>

        <el-table-column label="Actions" width="220" align="right">
          <template #default="{ row }">
            <template v-if="row.id === auth.userId">
              <span class="u-text-muted">Your account</span>
            </template>
            <template v-else>
              <el-button link type="primary" @click="toggleRole(row)">
                {{ row.role === 'admin' ? 'Remove admin' : 'Make admin' }}
              </el-button>
              <el-button
                link
                :type="row.is_active ? 'warning' : 'success'"
                @click="toggleActive(row)"
              >
                {{ row.is_active ? 'Disable' : 'Enable' }}
              </el-button>
              <el-button link type="danger" @click="onDelete(row)">Delete</el-button>
            </template>
          </template>
        </el-table-column>

        <template #empty>
          <EmptyState compact title="No matching users" description="Try different filters" />
        </template>
      </el-table>

      <Pagination v-model:page="page" :size="size" :total="total" @change="load" />
    </div>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'

import EmptyState from '@/components/common/EmptyState.vue'
import GlideSelect from '@/components/common/GlideSelect.vue'
import Pagination from '@/components/common/Pagination.vue'
import { adminDeleteUser, adminListUsers, adminUpdateUser } from '@/api/modules/admin'
import { useAuthStore } from '@/stores/auth'
import { ADMIN_PAGE_SIZE } from '@/utils/constants'
import { formatDate } from '@/utils/format'

const auth = useAuthStore()

const rows = ref([])
const total = ref(0)
const page = ref(1)
const size = ref(ADMIN_PAGE_SIZE)
const loading = ref(true)

const ROLE_OPTIONS = [
  { value: 'user', label: 'User' },
  { value: 'admin', label: 'Admin' },
]

const ACTIVE_OPTIONS = [
  { value: true, label: 'Active' },
  { value: false, label: 'Disabled' },
]

const filters = reactive({ role: '', is_active: '', q: '' })

function buildParams() {
  const params = { page: page.value, size: size.value }
  if (filters.role) params.role = filters.role
  if (filters.is_active !== '' && filters.is_active !== null) params.is_active = filters.is_active
  if (filters.q.trim()) params.q = filters.q.trim()
  return params
}

async function load() {
  loading.value = true
  try {
    const data = await adminListUsers(buildParams())
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

async function toggleRole(row) {
  const nextRole = row.role === 'admin' ? 'user' : 'admin'
  const tip =
    nextRole === 'admin'
      ? `Make ${row.nickname || row.username} an admin? This account will be able to access the admin area.`
      : `Remove admin access from ${row.nickname || row.username}?`
  try {
    await ElMessageBox.confirm(tip, 'Change role', { type: 'warning' })
  } catch {
    return
  }
  try {
    await adminUpdateUser(row.id, { role: nextRole })
    ElMessage.success('Updated')
    load()
  } catch {
    // http 层已提示
  }
}

async function toggleActive(row) {
  const next = !row.is_active
  try {
    await ElMessageBox.confirm(
      next
        ? `Enable ${row.nickname || row.username}? This account will be able to sign in again.`
        : `Disable ${row.nickname || row.username}? This account will no longer be able to sign in.`,
      'Change account status',
      { type: 'warning' },
    )
  } catch {
    return
  }
  try {
    await adminUpdateUser(row.id, { is_active: next })
    ElMessage.success('Updated')
    load()
  } catch {
    // http 层已提示
  }
}

async function onDelete(row) {
  try {
    await ElMessageBox.confirm(
      `Delete ${row.nickname || row.username}? This will be refused while the account still has images.`,
      'Delete user',
      { type: 'warning', confirmButtonText: 'Delete', confirmButtonClass: 'el-button--danger' },
    )
  } catch {
    return
  }
  try {
    await adminDeleteUser(row.id)
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

.cell-user {
  display: flex;
  align-items: center;
  gap: 10px;
}

.cell-user__name {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: $color-text;
}

.cell-user__self {
  padding: 0 5px;
  border-radius: $radius-sm;
  background: $color-primary-soft;
  color: $color-primary;
  font-size: 11px;
}

.cell-user__account {
  font-size: 12px;
  color: $color-text-muted;
}
</style>