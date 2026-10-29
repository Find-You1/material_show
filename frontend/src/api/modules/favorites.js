import http from '@/api/http'

/** 我的收藏（分页返回 Page[ImageOut]） */
export function listFavorites(params) {
  return http.get('/me/favorites', { params })
}