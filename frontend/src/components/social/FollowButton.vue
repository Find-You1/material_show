<template>
  <el-button
    :size="size"
    :type="isFollowing ? 'default' : 'primary'"
    :plain="!isFollowing"
    :loading="busy"
    class="follow-btn"
    :class="{ 'follow-btn--on': isFollowing }"
    @click="onClick"
  >
    {{ isFollowing ? 'Following' : 'Follow' }}
  </el-button>
</template>

<script setup>
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { followUser, unfollowUser } from '@/api/modules/social'
import { useAuthStore } from '@/stores/auth'

const props = defineProps({
  username: { type: String, required: true },
  isFollowing: { type: Boolean, default: false },
  size: { type: String, default: 'default' },
})

const emit = defineEmits(['update:isFollowing', 'update:followerCount'])

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const busy = ref(false)

async function onClick() {
  // 先在点击时拦住，不要等接口 401 再跳，那样很突兀
  if (!auth.isLoggedIn) {
    ElMessage.info('Sign in to follow')
    router.push({ name: 'login', query: { redirect: route.fullPath } })
    return
  }

  busy.value = true
  try {
    const res = props.isFollowing
      ? await unfollowUser(props.username)
      : await followUser(props.username)
    emit('update:isFollowing', !!res.is_following)
    emit('update:followerCount', res.follower_count)
  } catch {
    // http 层已提示
  } finally {
    busy.value = false
  }
}
</script>

<style lang="scss" scoped>
// 已关注时弱化成次要文字，hover 变红提示「点一下就是取消关注」
.follow-btn--on {
  --el-button-text-color: #{$color-text-secondary};
  --el-button-border-color: #{$color-border};
  --el-button-hover-text-color: #{$color-danger};
  --el-button-hover-border-color: #{$color-danger};
}
</style>