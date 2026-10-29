<template>
  <div class="u-page">
    <div class="page-container">
      <div class="profile">
        <el-avatar :size="64" :src="profile?.avatar_url || ''" class="profile__avatar">
          {{ (profile?.nickname || profile?.username || 'U').slice(0, 1).toUpperCase() }}
        </el-avatar>

        <div class="profile__main">
          <div class="profile__name">
            {{ profile?.nickname || profile?.username || route.params.username }}
            <el-tag v-if="profile?.role === 'admin'" size="small" effect="light" round>Official account</el-tag>
          </div>
          <div class="profile__account">@{{ profile?.username }}</div>
          <p v-if="profile?.bio" class="profile__bio">{{ profile.bio }}</p>
          <div class="profile__stats">
            <StatNumber :value="profile?.upload_count || 0" label="Uploads" />
            <StatNumber :value="profile?.approved_count || 0" label="Public" />
            <button type="button" class="stat-btn" @click="openList('following')">
              <StatNumber :value="profile?.following_count || 0" label="Following" />
            </button>
            <button type="button" class="stat-btn" @click="openList('followers')">
              <StatNumber :value="profile?.follower_count || 0" label="Followers" />
            </button>
            <StatNumber :value="joinDate" label="Joined" />
          </div>
        </div>

        <!-- 自己的主页不显示互动按钮 -->
        <div v-if="!isSelf" class="profile__aside">
          <FollowButton
            :username="username"
            :is-following="profile?.is_following || false"
            @update:is-following="onFollowChange"
            @update:follower-count="onFollowerCount"
          />
          <el-button plain @click="onMessage">Message</el-button>
        </div>
      </div>

      <div class="u-mt-24">
        <div class="u-section-title u-mb-12">Public images</div>
        <ImageFeed
          v-model:order="order"
          :fetcher="listImages"
          :params="{ owner: username }"
          empty-title="No public images yet"
          empty-desc="Images appear here once they are approved"
        />
      </div>
    </div>

    <FollowListDialog v-model="listVisible" :username="username" :mode="listMode" />
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import ImageFeed from '@/components/image/ImageFeed.vue'
import StatNumber from '@/components/common/StatNumber.vue'
import FollowButton from '@/components/social/FollowButton.vue'
import FollowListDialog from '@/components/social/FollowListDialog.vue'
import { listImages } from '@/api/modules/images'
import { getUserProfile } from '@/api/modules/users'
import { useAuthStore } from '@/stores/auth'
import { formatDate } from '@/utils/format'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const profile = ref(null)
const order = ref('latest')

const listVisible = ref(false)
const listMode = ref('followers')

const username = computed(() => String(route.params.username || ''))
const joinDate = computed(() => formatDate(profile.value?.created_at))
const isSelf = computed(() => !!auth.userId && auth.userId === profile.value?.id)

function openList(mode) {
  listMode.value = mode
  listVisible.value = true
}

function onFollowChange(value) {
  if (profile.value) profile.value.is_following = value
}

function onFollowerCount(value) {
  if (profile.value) profile.value.follower_count = value
}

function onMessage() {
  // 先拦未登录，别等接口 401 再跳
  if (!auth.isLoggedIn) {
    ElMessage.info('Sign in to send a message')
    router.push({ name: 'login', query: { redirect: route.fullPath } })
    return
  }
  router.push({ name: 'my-messages', query: { tab: 'chat', u: username.value } })
}

watch(
  username,
  async (value) => {
    profile.value = null
    if (!value) return
    try {
      profile.value = await getUserProfile(value)
    } catch {
      // 用户不存在时列表自然为空
    }
  },
  { immediate: true },
)
</script>

<style lang="scss" scoped>
.profile {
  display: flex;
  align-items: flex-start;
  gap: 20px;
  padding: 24px;
  background: $color-bg-card;
  border: 1px solid $color-border;
  border-radius: $radius-card;
  box-shadow: $shadow-card;

  @include respond($bp-sm) {
    flex-direction: column;
    gap: 14px;
  }
}

.profile__avatar {
  flex: none;
  background: $color-primary-soft;
  color: $color-primary;
  font-weight: 600;
}

.profile__main {
  flex: 1 1 auto;
  min-width: 0;
}

// 关注按钮固定在右上角，不随简介长短左右漂移
.profile__aside {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  padding-top: 4px;
}

.profile__name {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.2px;
  color: $color-text;
}

.profile__account {
  margin-top: 2px;
  font-size: 12px;
  color: $color-text-muted;
}

.profile__bio {
  margin-top: 10px;
  font-size: 13px;
  color: $color-text-secondary;
  max-width: 620px;
}

.profile__stats {
  display: flex;
  gap: 32px;
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid $color-border;

  @include respond($bp-sm) {
    gap: 20px;
  }
}

// 关注 / 粉丝做成按钮：去掉默认外观，只留 StatNumber 本身，hover 才提示可点
.stat-btn {
  padding: 0;
  border: none;
  background: none;
  font: inherit;
  text-align: left;
  cursor: pointer;

  &:focus-visible {
    @include focus-ring;
  }

  &:hover :deep(.stat__value) {
    color: $color-primary-dark;
    text-decoration: underline;
    text-underline-offset: 3px;
  }
}
</style>