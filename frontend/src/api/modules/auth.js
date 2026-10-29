import http from '@/api/http'

/** 注册（成功后直接返回 token，前端自动登录） */
export function register(data) {
  return http.post('/auth/register', data, { silent: true })
}

/** 登录：account 支持用户名或邮箱 */
export function login(data) {
  return http.post('/auth/login', data, { silent: true })
}

/** 当前登录用户 */
export function getMe() {
  return http.get('/me')
}

/** 修改昵称/简介/头像 */
export function updateMe(data) {
  return http.patch('/me', data)
}

/** 上传头像：后端居中裁方成 512px WEBP，表单字段固定为 file */
export function uploadAvatar(file) {
  const form = new FormData()
  form.append('file', file)
  // 不手写 Content-Type，交给 axios 带 boundary
  return http.post('/me/avatar', form)
}

/** 移除头像，回落到昵称首字母 */
export function removeAvatar() {
  return http.delete('/me/avatar')
}

/** 修改密码（成功后旧 token 仍有效，但建议前端提示重新登录） */
export function changePassword(data) {
  return http.post('/me/password', data)
}

/** 个人中心统计：上传/通过/待审/驳回/收藏/下载总量 */
export function getMeStats() {
  return http.get('/me/stats')
}