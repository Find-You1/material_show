import http from '@/api/http'

// ==================== 公共 ====================

/**
 * 分类列表
 * @param {boolean} withCount true(默认) 只返回有图的分类；false 返回全部
 */
export function getCategories(withCount = true) {
  return http.get('/categories', { params: { with_count: withCount } })
}

export function getCategory(slug) {
  return http.get(`/categories/${encodeURIComponent(slug)}`)
}

/** 标签列表：keyword 为空时按热度返回；用于搜索建议 */
export function getTags(params = {}) {
  return http.get('/tags', { params })
}

export function getTag(slug) {
  return http.get(`/tags/${encodeURIComponent(slug)}`)
}

// ==================== 后台管理 ====================

export function adminListCategories(params = {}) {
  return http.get('/admin/taxonomy/categories', { params })
}

export function adminCreateCategory(data) {
  return http.post('/admin/taxonomy/categories', data)
}

export function adminUpdateCategory(id, data) {
  return http.patch(`/admin/taxonomy/categories/${id}`, data)
}

export function adminDeleteCategory(id) {
  return http.delete(`/admin/taxonomy/categories/${id}`)
}

export function adminListTags(params = {}) {
  return http.get('/admin/taxonomy/tags', { params })
}

/** 改名会自动同步 images.tag_text，无需前端额外处理 */
export function adminUpdateTag(id, data) {
  return http.patch(`/admin/taxonomy/tags/${id}`, data)
}

export function adminDeleteTag(id) {
  return http.delete(`/admin/taxonomy/tags/${id}`)
}