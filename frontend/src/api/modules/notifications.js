import http from '@/api/http'

/** 通知列表（分页） */
export function listNotifications(params) {
  return http.get('/notifications', { params })
}

/** ids 传空表示全部标记已读；返回 {unread_count} */
export function markNotificationsRead(ids = null) {
  return http.post('/notifications/read', { ids })
}

/** 导航栏红点用的汇总：{notifications, messages, total} */
export function getUnread() {
  // silent：轮询偶发失败不该弹全局错误提示，红点保持旧值即可
  return http.get('/me/unread', { silent: true })
}