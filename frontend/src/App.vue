<template>
  <!-- 根组件只负责路由出口。Apple 式浅色体系下不铺任何 WebGL 背景，
       页面底就是纯白；导航栏/页脚由各 Layout 自己渲染 -->
  <router-view v-slot="{ Component }">
    <transition name="neon" mode="out-in">
      <component :is="Component" />
    </transition>
  </router-view>
</template>

<script setup>
import { watch } from 'vue'

import { useAuthStore } from '@/stores/auth'
import { useRealtimeStore } from '@/stores/realtime'

const auth = useAuthStore()
const rt = useRealtimeStore()

// 登录态是未读轮询/实时推送的唯一开关：登出后必须断掉，否则会拿着空 token 反复请求
watch(
  () => auth.isLoggedIn,
  (loggedIn) => (loggedIn ? rt.connect() : rt.disconnect()),
  { immediate: true },
)
</script>

<style lang="scss">
#app {
  min-height: 100%;
}
</style>
