import http from '@/api/http'

/** 作者主页对外信息（不含邮箱） */
export function getUserProfile(username) {
  return http.get(`/users/${encodeURIComponent(username)}`)
}

/** 按用户名 / 昵称搜用户，返回 Page<FollowUserOut>（带 is_following） */
export function searchUsers(params) {
  return http.get('/search/users', { params })
}