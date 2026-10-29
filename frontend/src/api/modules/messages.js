import http from '@/api/http'

/** 会话列表（分页） */
export function listConversations(params) {
  return http.get('/messages/conversations', { params })
}

/**
 * 会话内消息，按 id 游标翻页。
 * - before_id：向上翻历史
 * - after_id：增量补齐（WS 降级 / 重连时用），与 before_id 互斥
 */
export function listMessages(username, params) {
  return http.get(`/messages/${encodeURIComponent(username)}`, { params })
}

/** 发一条私信，返回落库后的消息 */
export function sendMessage(username, content) {
  return http.post(`/messages/${encodeURIComponent(username)}`, { content })
}

/** 把该会话里对方发来的消息标记为已读，返回 {unread_count} */
export function markConversationRead(username) {
  return http.post(`/messages/${encodeURIComponent(username)}/read`)
}