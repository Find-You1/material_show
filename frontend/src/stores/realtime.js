/**
 * 未读状态与实时推送。
 *
 * 原则：**所有写操作走 REST，推送只做实时性增强** —— 推送失败不影响业务成功，
 * 未读数也永远以服务端返回的真值为准（每次进入页面 / 重连都 refreshUnread 校正）。
 *
 * 连接策略：WebSocket 优先；建连被拒（4401）不重试；连续失败 5 次降级为 30 秒轮询。
 * 单一进程内存连接表，因此后端必须单进程运行（--workers > 1 推送必丢）。
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'

import { useAuthStore } from '@/stores/auth'
import { getUnread } from '@/api/modules/notifications'

const POLL_INTERVAL = 30000
const PING_INTERVAL = 25000
// 浏览器在 WS 半开时不会触发 onclose，只能靠应用层心跳自己发现
const PONG_TIMEOUT = 60000
const MAX_RETRY = 5

function emptyUnread() {
  return { notifications: 0, messages: 0, total: 0 }
}

function normalizeUnread(data) {
  return {
    notifications: data?.notifications || 0,
    messages: data?.messages || 0,
    total: data?.total ?? (data?.notifications || 0) + (data?.messages || 0),
  }
}

export const useRealtimeStore = defineStore('realtime', () => {
  // idle：未登录 / 已登出；connecting：建连中；open：已连通；
  // closed：被拒且不再重连；polling：降级轮询
  const status = ref('idle')
  const unread = ref(emptyUnread())
  // 当前正在看的会话对端 id：消息中心打开时填上，避免给自己正在看的会话加未读
  const viewingUserId = ref(null)

  let ws = null
  let retry = 0
  let retryTimer = null
  let pollTimer = null
  let pingTimer = null
  let lastPong = 0
  let manualClose = true
  const listeners = new Set()

  /** 订阅推送（返回退订函数）。messages 视图用它把新消息实时插进对话。 */
  function subscribe(fn) {
    listeners.add(fn)
    return () => listeners.delete(fn)
  }

  function emit(payload) {
    for (const fn of listeners) {
      try {
        fn(payload)
      } catch {
        // 单个订阅者出错不影响其它订阅者与连接本身
      }
    }
  }

  async function refreshUnread() {
    try {
      const data = await getUnread()
      unread.value = normalizeUnread(data)
    } catch {
      // 拿不到就保持旧值，红点不因一次网络抖动而闪烁
    }
    return unread.value
  }

  function setViewingUser(userId) {
    viewingUserId.value = userId ?? null
  }

  // ---------------- 连接 ----------------

  function wsUrl() {
    const auth = useAuthStore()
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    return `${proto}://${location.host}/api/ws?token=${encodeURIComponent(auth.token)}`
  }

  function connect() {
    const auth = useAuthStore()
    if (!auth.token || ws) return
    manualClose = false
    retry = 0
    open()
  }

  function open() {
    const auth = useAuthStore()
    if (manualClose || !auth.token) return

    let socket
    try {
      socket = new WebSocket(wsUrl())
    } catch {
      scheduleReconnect()
      return
    }
    ws = socket
    status.value = 'connecting'

    socket.onopen = () => {
      retry = 0
      status.value = 'open'
      stopPolling()
      lastPong = Date.now()
      startHeartbeat()
      // 重连成功后对一次未读真值，避免挂机期间红点失真
      refreshUnread()
      emit({ type: 'open' })
    }

    socket.onmessage = (event) => {
      let data
      try {
        data = JSON.parse(event.data)
      } catch {
        return
      }
      handle(data)
    }

    socket.onclose = (event) => {
      stopHeartbeat()
      ws = null
      if (manualClose) {
        status.value = 'idle'
        return
      }
      if (event.code === 4401) {
        // 凭证无效：重试也没用，先对一次真值就停
        refreshUnread()
        status.value = 'closed'
        return
      }
      scheduleReconnect()
    }
  }

  function handle(data) {
    if (!data || typeof data !== 'object') return

    if (data.type === 'hello') {
      if (data.unread) unread.value = normalizeUnread(data.unread)
    } else if (data.type === 'notification') {
      unread.value = bump('notifications')
    } else if (data.type === 'message') {
      const auth = useAuthStore()
      // 自己发的（多标签页同步）与「正在看的会话」都不加未读
      if (data.sender_id !== auth.userId && data.sender_id !== viewingUserId.value) {
        unread.value = bump('messages')
      }
    } else if (data.type === 'pong') {
      lastPong = Date.now()
    }

    emit(data)
  }

  function bump(key) {
    const next = { ...unread.value, [key]: unread.value[key] + 1 }
    next.total = next.notifications + next.messages
    return next
  }

  function startHeartbeat() {
    stopHeartbeat()
    pingTimer = setInterval(() => {
      if (!ws || ws.readyState !== WebSocket.OPEN) return
      if (Date.now() - lastPong > PONG_TIMEOUT) {
        // 半开连接：主动关掉，onclose 会走重连
        ws.close()
        return
      }
      ws.send(JSON.stringify({ type: 'ping' }))
    }, PING_INTERVAL)
  }

  function stopHeartbeat() {
    if (pingTimer) clearInterval(pingTimer)
    pingTimer = null
  }

  function scheduleReconnect() {
    if (manualClose) return
    retry += 1
    if (retry > MAX_RETRY) {
      startPolling()
      return
    }
    status.value = 'connecting'
    // 指数退避 + ±20% 抖动；夹在 [0.5s, 30s] 避免同时重连打爆服务端
    const base = Math.min(30000, 1000 * 2 ** (retry - 1))
    const delay = Math.max(500, base + base * 0.2 * (Math.random() * 2 - 1))
    retryTimer = setTimeout(() => {
      retryTimer = null
      if (!manualClose) open()
    }, delay)
  }

  function startPolling() {
    status.value = 'polling'
    refreshUnread()
    if (!pollTimer) pollTimer = setInterval(refreshUnread, POLL_INTERVAL)
  }

  function stopPolling() {
    if (pollTimer) clearInterval(pollTimer)
    pollTimer = null
  }

  function disconnect() {
    manualClose = true
    if (retryTimer) clearTimeout(retryTimer)
    retryTimer = null
    stopHeartbeat()
    stopPolling()
    if (ws) {
      try {
        ws.close()
      } catch {
        // 已经断了就忽略
      }
      ws = null
    }
    retry = 0
    status.value = 'idle'
    unread.value = emptyUnread()
    viewingUserId.value = null
  }

  /** 切回前台 / 网络恢复：立刻重置退避重连，不等下一次定时 */
  function onResume() {
    const auth = useAuthStore()
    if (manualClose || !auth.token) return
    if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
      if (retryTimer) clearTimeout(retryTimer)
      retryTimer = null
      retry = 0
      stopPolling()
      open()
      return
    }
    refreshUnread()
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('online', onResume)
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) onResume()
    })
  }

  return {
    status,
    unread,
    viewingUserId,
    subscribe,
    refreshUnread,
    setViewingUser,
    connect,
    disconnect,
  }
})