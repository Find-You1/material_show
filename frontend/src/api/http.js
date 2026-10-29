import axios from 'axios'

import { TOKEN_KEY, USER_KEY } from '@/utils/constants'

// ElMessage 走 unplugin-auto-import 自动引入，不要手写 import，
// 否则按需样式不会被注入，弹出来的提示是裸的。

const http = axios.create({
  baseURL: '/api',
  timeout: 20000,
})

// ---------------- 请求拦截 ----------------
http.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY)
  if (token) {
    config.headers = config.headers || {}
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// 401 时避免并发请求弹出多个登录跳转
let redirecting = false

function clearAuth() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

function redirectToLogin() {
  if (redirecting) return
  redirecting = true
  const full = window.location.pathname + window.location.search
  const target = full.startsWith('/login') ? '/login' : `/login?redirect=${encodeURIComponent(full)}`
  // 用 location 而非 router，避免与 router 循环依赖
  window.location.assign(target)
}

/** 从后端的 {code, message} / FastAPI 的 {detail} 里抠出可读文案 */
function extractMessage(error) {
  const data = error.response?.data
  if (data) {
    if (typeof data === 'string' && data.trim()) return data
    if (typeof data.message === 'string' && data.message) return data.message
    if (Array.isArray(data.detail) && data.detail.length) {
      const first = data.detail[0]
      const field = Array.isArray(first?.loc) ? first.loc[first.loc.length - 1] : ''
      const msg = first?.msg || '参数不合法'
      return field ? `${field}: ${msg}` : msg
    }
    if (typeof data.detail === 'string' && data.detail) return data.detail
  }
  if (error.code === 'ECONNABORTED') return '请求超时，请稍后重试'
  if (!error.response) return '网络异常，请检查后端服务是否已启动'
  const status = error.response.status
  if (status === 403) return '没有权限执行该操作'
  if (status === 404) return '请求的资源不存在'
  if (status >= 500) return '服务器开小差了，请稍后重试'
  return error.message || '请求失败'
}

// ---------------- 响应拦截 ----------------
http.interceptors.response.use(
  // 直接返回业务数据，调用方不用再写 .data
  (response) => response.data,
  (error) => {
    const config = error.config || {}
    const status = error.response?.status
    const message = extractMessage(error)

    if (status === 401) {
      clearAuth()
      // 登录接口本身返回 401 属于"账号或密码错误"，原样抛给页面处理
      const isAuthEntry = String(config.url || '').includes('/auth/')
      if (!isAuthEntry && !config.skipAuthRedirect) {
        redirectToLogin()
      }
    }

    if (!config.silent) {
      ElMessage.error(message)
    }

    // 把整理后的文案挂到 error 上，页面可直接用
    error.friendlyMessage = message
    return Promise.reject(error)
  },
)

export { clearAuth, extractMessage }
export default http