import http from '@/api/http'

// ==================== 仪表盘 ====================

/** 各状态数量：pending/approved/rejected/taken_down/queued/processing/failed/ready */
export function getAuditStats() {
  return http.get('/admin/audit/stats')
}

// ==================== 审核队列 ====================

/** status=pending|approved|rejected|all，source=official|community */
export function listAuditQueue(params) {
  return http.get('/admin/audit', { params })
}

export function getAuditDetail(id) {
  return http.get(`/admin/audit/${id}`)
}

/** 审核轨迹：[{action, from_status, to_status, reason, admin_id, created_at}] */
export function getAuditLogs(id) {
  return http.get(`/admin/audit/${id}/logs`)
}

export function approveImage(id) {
  return http.post(`/admin/audit/${id}/approve`)
}

export function rejectImage(id, reason) {
  return http.post(`/admin/audit/${id}/reject`, { reason })
}

// ==================== 图片管理 ====================

/** 支持 audit_status / process_status / source / taken_down / q */
export function adminListImages(params) {
  return http.get('/admin/images', { params })
}

export function adminGetImage(id) {
  return http.get(`/admin/images/${id}`)
}

export function adminUpdateImage(id, data) {
  return http.patch(`/admin/images/${id}`, data)
}

export function adminDeleteImage(id) {
  return http.delete(`/admin/images/${id}`)
}

export function takedownImage(id, reason) {
  return http.post(`/admin/images/${id}/takedown`, { reason: reason || null })
}

export function restoreImage(id) {
  return http.post(`/admin/images/${id}/restore`)
}

export function reprocessImage(id) {
  return http.post(`/admin/images/${id}/reprocess`)
}

// ==================== 用户管理 ====================

export function adminListUsers(params) {
  return http.get('/admin/users', { params })
}

export function adminGetUser(id) {
  return http.get(`/admin/users/${id}`)
}

/** data: { role?: 'user'|'admin', is_active?: boolean }（改自己会 400） */
export function adminUpdateUser(id, data) {
  return http.patch(`/admin/users/${id}`, data)
}

export function adminDeleteUser(id) {
  return http.delete(`/admin/users/${id}`)
}