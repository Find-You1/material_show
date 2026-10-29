<template>
  <div class="layout">
    <!-- 与前台共用同一个 AppNavbar，保证各页导航完全一致 -->
    <AppNavbar />

    <div class="layout__body page-container">
      <aside class="layout__side">
        <div class="layout__side-title">Admin</div>
        <nav class="layout__nav">
          <router-link
            v-for="item in navItems"
            :key="item.name"
            :to="{ name: item.name }"
            class="layout__nav-item"
            :class="{ 'is-active': isActive(item) }"
          >
            {{ item.label }}
            <el-badge
              v-if="item.name === 'admin-audit' && admin.pending > 0"
              :value="admin.pending"
              :max="99"
              class="layout__badge"
            />
          </router-link>
        </nav>
      </aside>

      <main class="layout__content">
        <router-view v-slot="{ Component }">
          <transition name="neon" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </main>
    </div>
  </div>
</template>

<script setup>
import { onMounted } from 'vue'
import { useRoute } from 'vue-router'

import AppNavbar from '@/components/layout/AppNavbar.vue'
import { useAdminStore } from '@/stores/admin'

const route = useRoute()
const admin = useAdminStore()

const navItems = [
  { name: 'admin-dashboard', label: 'Overview' },
  { name: 'admin-audit', label: 'Audit queue' },
  { name: 'admin-images', label: 'Images' },
  { name: 'admin-users', label: 'Users' },
  { name: 'admin-categories', label: 'Categories' },
  { name: 'admin-tags', label: 'Tags' },
]

function isActive(item) {
  return route.name === item.name
}

onMounted(admin.refreshPending)
</script>

<style lang="scss" scoped>
.layout {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.layout__body {
  flex: 1 1 auto;
  display: flex;
  align-items: flex-start;
  gap: 24px;
  padding-block: 24px 40px;
}

.layout__side {
  position: sticky;
  top: calc(#{$navbar-height} + 24px);
  flex: none;
  width: 172px;
  padding: 12px;
  background: $color-bg-card;
  border: 1px solid $color-border;
  border-radius: $radius-card;
  box-shadow: $shadow-card;

  @include respond($bp-md) {
    display: none;
  }
}

.layout__side-title {
  padding: 4px 10px 10px;
  font-size: 12px;
  font-weight: 600;
  color: $color-text-muted;
  letter-spacing: 0.4px;
}

.layout__nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.layout__nav-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border-radius: $radius-base;
  font-size: 13px;
  color: $color-text-secondary;

  &:hover {
    color: $color-text;
    background: $color-bg-hover;
  }

  &.is-active {
    color: $color-primary;
    background: $color-primary-soft;
    font-weight: 600;
  }
}

.layout__badge {
  :deep(.el-badge__content) {
    transform: translateY(0);
  }
}

.layout__content {
  flex: 1 1 auto;
  min-width: 0;
  // 路由 3D 转场的透视父级（放在内容容器上，避免影响外层 fixed 元素）
  perspective: 1200px;
}
</style>