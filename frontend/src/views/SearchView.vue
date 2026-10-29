<template>
  <div class="u-page">
    <div class="page-container">
      <div class="page-head">
        <div>
          <div class="page-head__title">
            <template v-if="keyword">Results for “{{ keyword }}”</template>
            <template v-else>Search</template>
          </div>
          <div class="page-head__desc">
            <template v-if="tab === 'users'">
              Find creators by username or nickname. Follow them to see their new work
            </template>
            <template v-else>
              Search titles, descriptions, and tags. Multiple words are ranked by relevance by default
            </template>
          </div>
        </div>
        <div class="page-head__tools">
          <RubberSegment
            v-model="tab"
            :items="tabs"
            size="sm"
            aria-label="Search type"
          />
        </div>
      </div>

      <ImageFeed
        v-if="tab === 'images'"
        v-model:order="order"
        :fetcher="searchImages"
        :params="params"
        :order-options="SEARCH_ORDER_OPTIONS"
        :chips="chips"
        empty-title="No images found"
        empty-desc="Try another keyword, or remove some filters"
        @remove-filter="removeFilter"
        @reset="reset"
      >
        <template #filters>
          <div class="search-filter">
            <el-input
              v-model="input"
              placeholder="Search by keyword"
              clearable
              @keyup.enter="applyKeyword"
            >
              <template #prefix>
                <el-icon><Search /></el-icon>
              </template>
            </el-input>
          </div>
          <GlideSelect
            v-model="categoryModel"
            block
            clearable
            placeholder="All categories"
            :options="categoryOptions"
            aria-label="Filter by category"
            @change="applyCategory"
          />
          <el-select
            v-model="selectedTags"
            multiple
            collapse-tags
            collapse-tags-tooltip
            placeholder="Filter by tag"
            :multiple-limit="3"
            @change="applyTags"
          >
            <el-option v-for="t in tagOptions" :key="t.id" :label="t.name" :value="t.slug" />
          </el-select>
        </template>

        <template #empty-action>
          <div class="empty-actions">
            <el-button @click="reset">Clear filters</el-button>
            <!-- 图片一条都没命中时，最可能的原因就是关键词其实是个作者名 -->
            <el-button v-if="keyword" type="primary" plain @click="tab = 'users'">
              Search users for “{{ keyword }}”
            </el-button>
          </div>
        </template>
      </ImageFeed>

      <!-- 用户：整宽列表，每行一个关注按钮 -->
      <div v-else class="u-panel list-wide">
        <div class="user-filter">
          <el-input
            v-model="input"
            placeholder="Search by username or nickname"
            clearable
            @keyup.enter="applyKeyword"
          >
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
        </div>

        <div v-if="usersLoading && !users.length" class="user-hint">Loading…</div>

        <div v-else-if="!keyword" class="user-hint">Search by username or nickname</div>

        <EmptyState
          v-else-if="!users.length"
          compact
          title="No users found"
          description="Try another keyword, or enter a full username"
        />

        <ul v-else class="users">
          <li v-for="row in users" :key="row.id" class="users__item">
            <router-link
              :to="{ name: 'user', params: { username: row.username } }"
              class="users__link"
            >
              <el-avatar :size="40" :src="row.avatar_url || ''" class="users__avatar">
                {{ initialOf(row) }}
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
              @update:is-following="row.is_following = $event"
            />
          </li>
        </ul>

        <Pagination
          v-model:page="userPage"
          :size="USER_SIZE"
          :total="userTotal"
          @change="loadUsers"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Search } from '@element-plus/icons-vue'

import EmptyState from '@/components/common/EmptyState.vue'
import GlideSelect from '@/components/common/GlideSelect.vue'
import Pagination from '@/components/common/Pagination.vue'
import RubberSegment from '@/components/common/RubberSegment.vue'
import ImageFeed from '@/components/image/ImageFeed.vue'
import FollowButton from '@/components/social/FollowButton.vue'
import { searchImages } from '@/api/modules/images'
import { searchUsers } from '@/api/modules/users'
import { getCategories, getTags } from '@/api/modules/taxonomy'
import { useAuthStore } from '@/stores/auth'
import { SEARCH_ORDER_OPTIONS } from '@/utils/constants'

const USER_SIZE = 20

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const categories = ref([])
const tagOptions = ref([])

// 图片 / 用户两个标签，写进地址栏便于分享与刷新还原
const tab = ref(route.query.tab === 'users' ? 'users' : 'images')
const tabs = [
  { value: 'images', label: 'Images' },
  { value: 'users', label: 'Users' },
]

const input = ref(String(route.query.q || ''))
const order = ref(String(route.query.order || 'relevance'))

const keyword = computed(() => String(route.query.q || ''))
const categoryModel = ref(String(route.query.category || ''))
const selectedTags = ref(splitTags(route.query.tags))

const categoryOptions = computed(() => categories.value.map((c) => ({ value: c.slug, label: c.name })))

function splitTags(raw) {
  return String(raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

const params = computed(() => {
  const p = {}
  if (keyword.value) p.q = keyword.value
  const cat = String(route.query.category || '')
  if (cat) p.category = cat
  const tags = splitTags(route.query.tags)
  if (tags.length) p.tags = tags.join(',')
  return p
})

const chips = computed(() => {
  const list = []
  if (keyword.value) list.push({ key: 'q', label: `Keyword: ${keyword.value}` })
  if (route.query.category) {
    const name = categories.value.find((c) => c.slug === route.query.category)?.name
    list.push({ key: 'category', label: `Category: ${name || route.query.category}` })
  }
  for (const slug of splitTags(route.query.tags)) {
    const name = tagOptions.value.find((t) => t.slug === slug)?.name
    list.push({ key: `tag:${slug}`, label: `Tag: ${name || slug}` })
  }
  return list
})

// ---------------- 用户搜索 ----------------
const users = ref([])
const userTotal = ref(0)
const userPage = ref(1)
const usersLoading = ref(false)

function initialOf(u) {
  return (u?.nickname || u?.username || 'U').slice(0, 1).toUpperCase()
}

async function loadUsers() {
  const kw = keyword.value.trim()
  if (!kw) {
    users.value = []
    userTotal.value = 0
    return
  }
  usersLoading.value = true
  try {
    const data = await searchUsers({ q: kw, page: userPage.value, size: USER_SIZE })
    users.value = data?.items || []
    userTotal.value = data?.total || 0
  } catch {
    users.value = []
    userTotal.value = 0
  } finally {
    usersLoading.value = false
  }
}

function pushQuery(patch) {
  const next = { ...route.query, ...patch }
  // 筛选条件变化后回到第一页
  delete next.page
  // 去掉空值，避免地址栏堆积垃圾参数
  for (const key of Object.keys(next)) {
    if (next[key] === '' || next[key] === null || next[key] === undefined) delete next[key]
  }
  router.push({ name: 'search', query: next })
}

function applyKeyword() {
  pushQuery({ q: input.value.trim() })
}

function applyCategory(value) {
  pushQuery({ category: value || '' })
}

function applyTags(value) {
  pushQuery({ tags: (value || []).join(',') })
}

function removeFilter(key) {
  if (key === 'q') {
    input.value = ''
    pushQuery({ q: '' })
  } else if (key === 'category') {
    pushQuery({ category: '' })
  } else if (key.startsWith('tag:')) {
    const slug = key.slice(4)
    applyTags(selectedTags.value.filter((s) => s !== slug))
  }
}

function reset() {
  input.value = ''
  selectedTags.value = []
  router.push({ name: 'search', query: {} })
}

// 切换标签写回地址栏；换成用户时清掉图片特有的排序参数
watch(tab, (value) => {
  pushQuery(value === 'users' ? { tab: 'users' } : { tab: '' })
  if (value === 'users') {
    userPage.value = 1
    loadUsers()
  }
})

// 地址栏被外部改动（例如导航栏搜索）时同步本地控件
watch(
  () => route.query,
  (q) => {
    input.value = String(q.q || '')
    order.value = String(q.order || 'relevance')
    categoryModel.value = String(q.category || '')
    selectedTags.value = splitTags(q.tags)
  },
)

// 关键词变化：用户列表回到第一页重查（图片交给 ImageFeed 自己 watch）
watch(keyword, () => {
  if (tab.value !== 'users') return
  userPage.value = 1
  loadUsers()
})

// 排序同样写回地址栏，保证 URL 是唯一事实来源（刷新、分享链接不丢排序）
watch(order, (value) => {
  const next = value === 'relevance' ? '' : value
  if (String(route.query.order || '') !== next) pushQuery({ order: next })
})

onMounted(async () => {
  try {
    const [cats, tags] = await Promise.all([
      getCategories(),
      getTags({ limit: 50, only_used: true }),
    ])
    categories.value = cats
    tagOptions.value = tags
  } catch {
    // 选项拿不到不影响搜索本身
  }

  if (tab.value === 'users') loadUsers()
})
</script>

<style lang="scss" scoped>
.search-filter {
  max-width: 260px;
}

.page-head__tools {
  display: flex;
  align-items: center;
  gap: 12px;
}

.empty-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

// ---------------- 用户列表 ----------------
// 用户搜索是这一页的主入口，给它一块够大的落脚处：
// 站内搜索框一律药丸形，这里只是把尺寸放大（48 高、15px 字号、18px 图标），
// 原先 320px 宽、默认尺寸显得局促
.user-filter {
  max-width: 640px;
  padding: 4px 0 18px;

  :deep(.el-input__wrapper) {
    height: 48px;
    padding: 0 20px;
    border-radius: 999px;
  }

  :deep(.el-input__inner) {
    font-size: 15px;
  }

  :deep(.el-input__prefix) {
    font-size: 18px;
    color: $color-text-muted;
  }
}

.user-hint {
  padding: 32px 0;
  font-size: 13px;
  color: $color-text-muted;
  text-align: center;
}

.users {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
}

.users__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 4px;
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

.users__avatar {
  flex: none;
  background: $color-primary-soft;
  color: $color-primary;
  font-weight: 600;
}

.users__text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.users__name {
  font-size: 14px;
  font-weight: 600;
  color: $color-text;

  @include ellipsis;
}

.users__account {
  font-size: 12px;
  color: $color-text-muted;

  @include ellipsis;
}
</style>