import { defineStore } from 'pinia'

import * as authApi from '@/api/modules/auth'
import { TOKEN_KEY, USER_KEY } from '@/utils/constants'

function readUser() {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: localStorage.getItem(TOKEN_KEY) || '',
    user: readUser(),
  }),

  getters: {
    isLoggedIn: (state) => Boolean(state.token),
    isAdmin: (state) => state.user?.role === 'admin',
    displayName: (state) => state.user?.nickname || state.user?.username || '',
    username: (state) => state.user?.username || '',
    userId: (state) => state.user?.id ?? null,
  },

  actions: {
    /** main.js 启动时调用：把本地缓存装载进来（不做网络请求，避免首屏阻塞） */
    restore() {
      this.token = localStorage.getItem(TOKEN_KEY) || ''
      this.user = readUser()
    },

    setSession({ access_token, user }) {
      this.token = access_token || ''
      this.user = user || null
      if (this.token) {
        localStorage.setItem(TOKEN_KEY, this.token)
      } else {
        localStorage.removeItem(TOKEN_KEY)
      }
      if (this.user) {
        localStorage.setItem(USER_KEY, JSON.stringify(this.user))
      } else {
        localStorage.removeItem(USER_KEY)
      }
    },

    setUser(user) {
      this.user = user || null
      if (this.user) {
        localStorage.setItem(USER_KEY, JSON.stringify(this.user))
      } else {
        localStorage.removeItem(USER_KEY)
      }
    },

    async login(account, password) {
      const data = await authApi.login({ account, password })
      this.setSession(data)
      return data.user
    },

    async register(payload) {
      const data = await authApi.register(payload)
      this.setSession(data)
      return data.user
    },

    /** 拉一次最新的 me（用户可能改了昵称，或 token 已失效） */
    async fetchMe() {
      if (!this.token) return null
      const user = await authApi.getMe()
      this.setUser(user)
      return user
    },

    logout() {
      this.token = ''
      this.user = null
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem(USER_KEY)
    },
  },
})