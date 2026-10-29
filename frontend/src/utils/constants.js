// ============================================================
// 全局常量：枚举英文映射、排序选项、上传限制
// 后端字段取值以此为准，避免各页面各写一套字符串。
// ============================================================

// ---------- 审核状态 ----------
export const AUDIT_STATUS = {
  pending: { label: 'Pending', type: 'warning' },
  approved: { label: 'Approved', type: 'success' },
  rejected: { label: 'Rejected', type: 'danger' },
}

// ---------- 图片处理状态 ----------
export const PROCESS_STATUS = {
  queued: { label: 'Queued', type: 'info' },
  processing: { label: 'Processing', type: 'warning' },
  ready: { label: 'Ready', type: 'success' },
  failed: { label: 'Failed', type: 'danger' },
}

export const AUDIT_STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
]

export const SOURCE_OPTIONS = [
  { value: 'official', label: 'Official' },
  { value: 'community', label: 'Community' },
]

// ---------- 排序 ----------
export const ORDER_OPTIONS = [
  { value: 'latest', label: 'Latest' },
  { value: 'popular', label: 'Popular' },
  { value: 'downloads', label: 'Most downloaded' },
  { value: 'views', label: 'Most viewed' },
]

export const SEARCH_ORDER_OPTIONS = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'latest', label: 'Latest' },
  { value: 'popular', label: 'Popular' },
]

// ---------- 上传限制（与后端 schema 对齐）----------
export const UPLOAD_ACCEPT = 'image/jpeg,image/png,image/webp'
export const UPLOAD_MAX_MB = 20

// 头像单独一条线：只用来做 512px 方图，与后端 routers/me.py 的 AVATAR_MAX_BYTES 对齐
export const AVATAR_MAX_MB = 2
export const UPLOAD_MAX_TAGS = 10
export const TITLE_MAX = 200
export const DESC_MAX = 2000

// ---------- 尺寸档位 ----------
export const VARIANT_LABELS = {
  thumb: 'Thumb',
  preview: 'Preview',
  medium: 'Medium',
  original: 'Original',
}

export const PAGE_SIZE = 24
export const ADMIN_PAGE_SIZE = 20

// ---------- 本地存储键 ----------
export const TOKEN_KEY = 'ms_token'
export const USER_KEY = 'ms_user'

// 上传后轮询处理进度：间隔与超时
export const POLL_INTERVAL = 1500
export const POLL_TIMEOUT = 120000

export function auditStatusLabel(v) {
  return AUDIT_STATUS[v]?.label ?? v ?? '-'
}

export function auditStatusType(v) {
  return AUDIT_STATUS[v]?.type ?? 'info'
}

export function processStatusLabel(v) {
  return PROCESS_STATUS[v]?.label ?? v ?? '-'
}

export function processStatusType(v) {
  return PROCESS_STATUS[v]?.type ?? 'info'
}
