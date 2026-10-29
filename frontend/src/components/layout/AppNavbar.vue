<template>
  <header class="navbar" :class="{ 'navbar--dark': dark }">
    <div class="navbar__inner page-container">
      <!-- 左：品牌 + 主导航（纯文字，不用图标堆砌） -->
      <router-link to="/" class="navbar__brand">Lumen</router-link>

      <nav class="navbar__links">
        <router-link to="/" class="navbar__link">Discover</router-link>
        <router-link to="/search?order=popular" class="navbar__link">Popular</router-link>
        <router-link v-if="auth.isLoggedIn" to="/me/uploads" class="navbar__link">My uploads</router-link>
        <router-link v-if="auth.isLoggedIn" to="/me/favorites" class="navbar__link">Saved</router-link>
      </nav>

      <!-- 中：搜索 -->
      <div class="navbar__search">
        <el-input
          v-model="keyword"
          placeholder="Search images, tags or creators"
          clearable
          @keyup.enter="submitSearch"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>
      </div>

      <!-- 右：操作区 -->
      <div class="navbar__actions">
        <template v-if="auth.isLoggedIn">
          <router-link to="/me/messages" class="navbar__link navbar__msg">
            Messages
            <span v-if="unreadTotal" class="navbar__dot">{{ dotText }}</span>
          </router-link>
          <router-link to="/upload" class="navbar__upload">Upload</router-link>
          <router-link v-if="auth.isAdmin" to="/admin" class="navbar__link navbar__link--admin">Admin</router-link>

          <el-dropdown trigger="click" @command="onCommand">
            <button type="button" class="navbar__user">
              <el-avatar :size="28" :src="auth.user?.avatar_url || ''">
                {{ (auth.displayName || 'U').slice(0, 1).toUpperCase() }}
              </el-avatar>
              <span class="navbar__username">{{ auth.displayName }}</span>
            </button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="profile">My profile</el-dropdown-item>
                <el-dropdown-item command="settings">Settings</el-dropdown-item>
                <el-dropdown-item command="logout" divided>Sign out</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </template>

        <template v-else>
          <router-link to="/login" class="navbar__link">Sign in</router-link>
          <router-link to="/register" class="navbar__register">Get started</router-link>
        </template>
      </div>
    </div>
  </header>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Search } from '@element-plus/icons-vue'

import { useAuthStore } from '@/stores/auth'
import { useRealtimeStore } from '@/stores/realtime'

defineProps({
  /** 深色沉浸页（图片详情）用的深色导航栏 */
  dark: { type: Boolean, default: false },
})

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const rt = useRealtimeStore()

const keyword = ref('')

const unreadTotal = computed(() => rt.unread.total || 0)
// 超过两位数就收敛成 99+，否则红点会被撑宽、把导航栏挤变形
const dotText = computed(() => (unreadTotal.value > 99 ? '99+' : String(unreadTotal.value)))

// 进入搜索页时把 q 回填到输入框；离开搜索页清空
watch(
  () => route.query.q,
  (q) => {
    if (route.name === 'search') {
      keyword.value = q ? String(q) : ''
    }
  },
  { immediate: true },
)

function submitSearch() {
  const q = keyword.value.trim()
  if (!q) return
  router.push({ name: 'search', query: { ...route.query, q, page: undefined } })
}

function onCommand(cmd) {
  if (cmd === 'logout') {
    auth.logout()
    ElMessage.success('Signed out')
    if (route.meta.requiresAuth || route.meta.requiresAdmin) {
      router.push('/')
    }
  } else if (cmd === 'profile') {
    router.push({ name: 'user', params: { username: auth.username } })
  } else if (cmd === 'settings') {
    router.push({ name: 'my-settings' })
  }
}
</script>

<style lang="scss" scoped>
.navbar {
  position: sticky;
  top: 0;
  z-index: var(--z-navbar);
  width: 100%;
  height: $navbar-height;
  // Apple 式毛玻璃：近白 80% + 大模糊，滚动时内容从底下透出来
  background: rgba(251, 251, 253, 0.8);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);
}

.navbar__inner {
  display: flex;
  align-items: center;
  gap: 20px;
  height: 100%;
}

.navbar__brand {
  flex: none;
  font-size: 17px;
  font-weight: 700;
  letter-spacing: -0.03em;
  // 品牌名走纯色文本，不再用渐变字（渐变字是「AI 感」的主要来源之一）
  color: $color-text;
  transition: color 0.15s ease;

  &:hover {
    color: $color-primary;
  }
}

.navbar__links {
  flex: none;
  display: flex;
  align-items: center;
  gap: 2px;

  @include respond($bp-md) {
    display: none;
  }
}

.navbar__link {
  padding: 6px 10px;
  border-radius: $radius-sm;
  font-size: 13px;
  color: $color-text-secondary;
  white-space: nowrap;
  transition: color 0.15s ease, background 0.15s ease;

  &:hover {
    color: $color-text;
    background: rgba(0, 0, 0, 0.04);
  }

  &.router-link-exact-active {
    color: $color-text;
    font-weight: 500;
    background: transparent;
    box-shadow: none;
  }
}

.navbar__link--admin {
  color: $color-primary;
}

.navbar__msg {
  position: relative;
}

.navbar__dot {
  position: absolute;
  top: 2px;
  right: -4px;
  min-width: 15px;
  height: 15px;
  padding-inline: 3px;
  border-radius: 999px;
  background: $color-danger;
  color: #fff;
  font-size: 10px;
  font-weight: 600;
  line-height: 15px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.navbar__search {
  flex: 1 1 auto;
  max-width: 420px;
  min-width: 120px;

  :deep(.el-input__wrapper) {
    border-radius: 980px;
    background: $color-bg-hover;
    box-shadow: none;
    border: 1px solid transparent;

    &:hover {
      background: #efeff2;
    }

    &.is-focus {
      background: $color-bg-card;
      border-color: rgba(0, 113, 227, 0.45);
      box-shadow: 0 0 0 3px rgba(0, 113, 227, 0.12);
    }
  }
}

.navbar__actions {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

.navbar__upload {
  padding: 7px 16px;
  border-radius: 980px;
  font-size: 13px;
  font-weight: 500;
  color: #fff;
  background: $color-primary;
  transition: background 0.2s ease;

  &:hover {
    color: #fff;
    background: #0077ed;
  }
}

.navbar__register {
  padding: 7px 16px;
  border-radius: 980px;
  font-size: 13px;
  font-weight: 500;
  color: #fff;
  background: $color-primary;

  &:hover {
    color: #fff;
    background: #0077ed;
  }
}

.navbar__user {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 8px 3px 3px;
  border: 1px solid transparent;
  border-radius: 999px;
  background: transparent;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;

  &:hover {
    border-color: $color-border;
    background: rgba(0, 0, 0, 0.04);
  }
}

.navbar__username {
  font-size: 13px;
  color: $color-text;
  max-width: 88px;

  @include ellipsis;
}

// ---- 深色沉浸页的导航栏（图片详情）----
// 照片落在纯黑底上时，近白条会像贴上去的一层，所以整条换成黑玻璃、文字提亮
.navbar--dark {
  // 比首页那块黑玻璃更实一点：登录页背后是明亮的极光与雪地，
  // 0.72 的黑色压上去会被抬成中灰，一条灰带正好割在画面最上面
  background: rgba(7, 9, 14, 0.82);
  border-bottom-color: rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(24px) saturate(150%);
  -webkit-backdrop-filter: blur(24px) saturate(150%);

  .navbar__brand {
    color: #f5f5f7;

    &:hover {
      color: #ffffff;
    }
  }

  .navbar__link {
    color: rgba(245, 245, 247, 0.68);

    &:hover {
      color: #ffffff;
      background: rgba(255, 255, 255, 0.1);
    }

    &.router-link-exact-active {
      color: #ffffff;
      background: transparent;
    }
  }

  .navbar__link--admin {
    color: rgba(245, 245, 247, 0.78);
  }

  .navbar__search {
    :deep(.el-input__wrapper) {
      background: rgba(255, 255, 255, 0.12);
      border-color: transparent;

      &:hover {
        background: rgba(255, 255, 255, 0.16);
      }

      &.is-focus {
        border-color: rgba(41, 151, 255, 0.6);
        background: rgba(255, 255, 255, 0.16);
      }
    }

    :deep(.el-input__inner) {
      color: #f5f5f7;

      &::placeholder {
        color: rgba(245, 245, 247, 0.42);
      }
    }

    :deep(.el-input__prefix) {
      color: rgba(245, 245, 247, 0.5);
    }
  }

  .navbar__user:hover {
    border-color: rgba(255, 255, 255, 0.2);
    background: rgba(255, 255, 255, 0.08);
  }

  .navbar__username {
    color: #f5f5f7;
  }

  .navbar__register {
    // 黑场页面里按钮也用白色，避免一点蓝色破坏黑白画面
    color: #0a0a0a;
    border-color: transparent;
    background: #f5f5f7;

    &:hover {
      color: #000;
      border-color: transparent;
      background: #ffffff;
    }
  }
}
</style>