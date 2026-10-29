import http from '@/api/http'

/** 关注用户。返回 {is_following, follower_count}，省一次刷新请求 */
export function followUser(username) {
  return http.post(`/users/${encodeURIComponent(username)}/follow`)
}

/** 取消关注 */
export function unfollowUser(username) {
  return http.delete(`/users/${encodeURIComponent(username)}/follow`)
}

/** 粉丝列表（谁关注了 TA）。每行带 is_following，供列表里的关注按钮用 */
export function listFollowers(username, params) {
  return http.get(`/users/${encodeURIComponent(username)}/followers`, { params })
}

/** 关注列表（TA 关注了谁） */
export function listFollowing(username, params) {
  return http.get(`/users/${encodeURIComponent(username)}/following`, { params })
}

/** 屏蔽某人。返回 {is_blocked}，同时会解除双向关注 */
export function blockUser(username) {
  return http.post(`/users/${encodeURIComponent(username)}/block`)
}

/** 解除屏蔽 */
export function unblockUser(username) {
  return http.delete(`/users/${encodeURIComponent(username)}/block`)
}

/** 我屏蔽了谁（分页） */
export function listBlocks(params) {
  return http.get('/me/blocks', { params })
}