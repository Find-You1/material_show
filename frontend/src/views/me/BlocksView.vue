<template>
  <div class="u-page">
    <div class="page-container">
      <div class="page-head">
        <div>
          <div class="page-head__title">Blocked users</div>
          <div class="page-head__desc">Once blocked, neither of you can send messages or follow each other</div>
        </div>
        <el-button link @click="router.push({ name: 'my-messages', query: { tab: 'chat' } })">
          Back to messages
        </el-button>
      </div>

      <div class="u-card list-wide">
        <el-table v-loading="loading" :data="rows" style="width: 100%">
          <el-table-column label="User" min-width="240">
            <template #default="{ row }">
              <div class="cell-user">
                <el-avatar :size="36" :src="row.avatar_url || ''" class="cell-user__avatar">
                  {{ initialOf(row) }}
                </el-avatar>
                <div class="cell-user__body">
                  <div class="cell-user__name">
                    <router-link :to="{ name: 'user', params: { username: row.username } }">
                      {{ row.nickname || row.username }}
                    </router-link>
                  </div>
                  <div class="cell-user__meta">@{{ row.username }}</div>
                </div>
              </div>
            </template>
          </el-table-column>

          <el-table-column label="Blocked" width="180">
            <template #default="{ row }">
              <span class="u-text-muted">{{ formatDateTime(row.blocked_at) }}</span>
            </template>
          </el-table-column>

          <el-table-column label="Actions" width="140" align="right">
            <template #default="{ row }">
              <el-button link type="primary" :loading="busyId === row.id" @click="onUnblock(row)">
                Unblock
              </el-button>
            </template>
          </el-table-column>

          <template #empty>
            <EmptyState compact title="No blocked users" description="You can block someone from a direct message" />
          </template>
        </el-table>

        <Pagination v-model:page="page" :size="size" :total="total" @change="load" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import EmptyState from '@/components/common/EmptyState.vue'
import Pagination from '@/components/common/Pagination.vue'
import { listBlocks, unblockUser } from '@/api/modules/social'
import { formatDateTime } from '@/utils/format'

const PAGE_SIZE = 20

const router = useRouter()

const rows = ref([])
const total = ref(0)
const page = ref(1)
const size = ref(PAGE_SIZE)
const loading = ref(true)
const busyId = ref(null)

function initialOf(u) {
  return (u.nickname || u.username || 'U').slice(0, 1).toUpperCase()
}

async function load() {
  loading.value = true
  try {
    const data = await listBlocks({ page: page.value, size: size.value })
    rows.value = data?.items || []
    total.value = data?.total || 0
  } finally {
    loading.value = false
  }
}

async function onUnblock(row) {
  busyId.value = row.id
  try {
    await unblockUser(row.username)
    ElMessage.success(`Unblocked ${row.nickname || row.username}`)
    if (rows.value.length === 1 && page.value > 1) page.value -= 1
    load()
  } catch {
    // http 层已提示
  } finally {
    busyId.value = null
  }
}

onMounted(load)
</script>

<style lang="scss" scoped>
// 面板质感统一走全局 .u-card（solid 卡片），这页只补自己的内边距
.u-card {
  padding: 16px 18px 8px;
}

.cell-user {
  display: flex;
  align-items: center;
  gap: 10px;
}

.cell-user__avatar {
  flex: none;
  background: $color-primary-soft;
  color: $color-primary;
  font-weight: 600;
}

.cell-user__body {
  min-width: 0;
}

.cell-user__name {
  font-size: 13px;
  color: $color-text;

  @include ellipsis;

  a:hover {
    color: $color-primary;
  }
}

.cell-user__meta {
  font-size: 12px;
  color: $color-text-muted;
}
</style>