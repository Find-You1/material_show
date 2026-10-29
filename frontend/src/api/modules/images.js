import http from '@/api/http'

// ==================== 公共浏览 ====================

/** 图片列表：category / tag / owner 三选一或组合，order=latest|popular|downloads|views */
export function listImages(params) {
  return http.get('/images', { params })
}

/** 图片详情（含 variants 与 exif） */
export function getImage(id) {
  return http.get(`/images/${id}`)
}

/** 全文搜索：q / tags(slug 逗号分隔) / category / order=relevance|latest|popular */
export function searchImages(params) {
  return http.get('/search', { params })
}

/** 取下载地址（后端同时记一条 downloads 明细并自增计数） */
export function downloadImage(id, variant = 'original') {
  return http.post(`/images/${id}/download`, null, { params: { variant }, silent: true })
}

/** 收藏 */
export function favoriteImage(id) {
  return http.post(`/images/${id}/favorite`, null, { silent: true })
}

/** 取消收藏 */
export function unfavoriteImage(id) {
  return http.delete(`/images/${id}/favorite`, { silent: true })
}

// ==================== 创作者上传 ====================

/**
 * 上传图片（multipart/form-data）
 * fields: file + title + description + category_id + tags(逗号分隔)
 * onProgress 用于进度条
 */
export function createUpload(formData, onProgress) {
  return http.post('/me/uploads', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000, // 大图 + 服务端处理，放宽超时
    silent: true,
    onUploadProgress: (e) => {
      if (onProgress && e.total) {
        onProgress(Math.round((e.loaded * 100) / e.total))
      }
    },
  })
}

/** 我的上传列表：status=pending|approved|rejected */
export function listMyUploads(params) {
  return http.get('/me/uploads', { params })
}

/** 轮询处理进度：process_status / process_error / variants_ready */
export function getMyUpload(id) {
  return http.get(`/me/uploads/${id}`, { silent: true })
}

/** 编辑标题/描述/分类/标签 */
export function updateMyUpload(id, data) {
  return http.patch(`/me/uploads/${id}`, data)
}

/** 被驳回后重新提交审核 */
export function resubmitMyUpload(id) {
  return http.post(`/me/uploads/${id}/resubmit`)
}

/** 处理失败后重试处理 */
export function reprocessMyUpload(id) {
  return http.post(`/me/uploads/${id}/reprocess`)
}

/** 删除（软删除） */
export function deleteMyUpload(id) {
  return http.delete(`/me/uploads/${id}`)
}