<template>
  <div class="layout" :class="{ 'layout--dark': route.meta.dark }">
    <!-- 根组件只负责路由出口，页面底色由 base.scss 统一给 -->
    <AppNavbar :dark="!!(route.meta.dark || route.meta.darkNav)" />

    <main class="layout__main">
      <router-view v-slot="{ Component }">
        <transition name="neon" mode="out-in">
          <component :is="Component" />
        </transition>
      </router-view>
    </main>

    <!-- 沉浸式页面（登录 / 注册）自己占满剩余视口，不需要页脚 -->
    <AppFooter v-if="!route.meta.immersive" />
  </div>
</template>

<script setup>
import { useRoute } from 'vue-router'

import AppNavbar from '@/components/layout/AppNavbar.vue'
import AppFooter from '@/components/layout/AppFooter.vue'

const route = useRoute()
</script>

<style lang="scss" scoped>
.layout {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

// 深色沉浸页（图片详情）：必须自己铺这层黑底。
// 全站已经不再挂 3D 环境背景，写 transparent 会直接露出 body 的近白底 ——
// 页面文字全是浅色，压在白底上就只剩「看不见的字」。
.layout--dark {
  background: $color-ink;
}

// Apple 式转场只做淡入 + 上浮，不再需要 3D 透视；
// 去掉 perspective 还能避免给后代生成 containing block（曾导致 fixed 定位跳位）
.layout__main {
  flex: 1 1 auto;
}
</style>