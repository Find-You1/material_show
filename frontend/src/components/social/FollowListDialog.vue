<template>
  <el-dialog
    :model-value="modelValue"
    :title="dialogTitle"
    width="440px"
    @update:model-value="$emit('update:modelValue', $event)"
    @open="load(true)"
  >
    <div v-if="loading" class="loading u-label">Loading…</div>

    <div v-else-if="!rows.length" class="empty u-label">Nothing here yet</div>

    <ul v-else class="users">
      <li v-for="row in rows" :key="row.id" class="users__item">
        <router-link
          :to="{ name: 'user', params: { username: row.username } }"
          class="users__link"
          @click="$emit('update:modelValue', false)"
        >
          <el-avatar :size="36" :src="row.avatar_url || ''">
            {{ (row.nickname || row.username).slice(0, 1).toUpperCase() }}
          </el-avatar>
          <span class="users__text">
            <span class="users__name">{{ row.nickname || row.username }}</span>
            <span class="users__account">@{{ row.username }}</span>
          </span>
        </router-link>

        <FollowButton
          v-if="row.id !== auth.userId"
          size="small"
          :username="row.username"
          :is-following="row.is_following"
          @update:is-following="setFollowed(row, $event)"
        />
      </li>
    </ul>

    <div v-if="rows.length < total" class="more">
      <el-button link :loading="loading" @click="load(false)">Load more</el-button>
    </div>
  </el-dialog>
</template>

<script setup>
import { computed, ref, watch } from 'vue'

import FollowButton from '@/components/social/FollowButton.vue'
import { listFollowers, listFollowing } from '@/api/modules/social'
import { useAuthStore } from '@/stores/auth'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  username: { type: String, default: '' },
  // followers=粉丝，following=关注
  mode: { type: String, default: 'followers' },
})

defineEmits(['update:modelValue'])

const auth = useAuthStore()

const PAGE_SIZE = 20

const rows = ref([])
const total = ref(0)
const page = ref(0)
const loading = ref(false)

const dialogTitle = computed(() => (props.mode === 'followers' ? 'Followers' : 'Following'))

async function load(reset) {
  if (!props.username || loading.value) return
  if (reset) {
    page.value = 0
    rows.value = []
  }
  loading.value = true
  try {
    const fetcher = props.mode === 'followers' ? listFollowers : listFollowing
    const data = await fetcher(props.username, { page: page.value + 1, size: PAGE_SIZE })
    const items = data.items || []
    rows.value = reset ? items : rows.value.concat(items)
    total.value = data.total || 0
    page.value += 1
  } catch {
    // http 层已提示
  } finally {
    loading.value = false
  }
}

function setFollowed(row, value) {
  row.is_following = value
}

// 关闭时清空，下次打开一定是新的数据
watch(
  () => props.modelValue,
  (visible) => {
    if (!visible) {
      rows.value = []
      total.value = 0
      page.value = 0
    }
  },
)
</script>

<style lang="scss" scoped>
.users {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.users__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 4px;
  border-bottom: 1px solid $color-border;

  &:last-child {
    border-bottom: none;
  }
}

.users__link {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.users__text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.users__name {
  font-size: 13px;
  font-weight: 600;
  color: $color-text;

  @include ellipsis;
}

.users__account {
  font-size: 12px;
  color: $color-text-muted;

  @include ellipsis;
}

.loading,
.empty {
  padding: 28px 0;
  text-align: center;
}

.more {
  margin-top: 10px;
  text-align: center;
}
</style>