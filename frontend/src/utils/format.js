// 展示层格式化工具。后端返回的时间是 ISO 字符串（UTC），统一转成东八区本地时间展示。

function toDate(value) {
  if (!value) return null
  if (value instanceof Date) return value
  // 后端 datetime 是 UTC 但不带时区后缀，补上 Z 再交给 Date 解析，
  // 否则浏览器会当成本地时间、比真实时间少 8 小时。
  const s = String(value)
  const normalized = /[zZ]|[+-]\d{2}:?\d{2}$/.test(s) ? s : `${s}Z`
  const d = new Date(normalized)
  return Number.isNaN(d.getTime()) ? null : d
}

function pad(n) {
  return String(n).padStart(2, '0')
}

/** 2026-09-30 12:05 */
export function formatDateTime(value) {
  const d = toDate(value)
  if (!d) return '-'
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 2026-09-30 */
export function formatDate(value) {
  const d = toDate(value)
  if (!d) return '-'
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** 刚刚 / 5 分钟前 / 3 小时前 / 2 天前 / 2026-09-30 */
export function formatRelative(value) {
  const d = toDate(value)
  if (!d) return '-'
  const diff = Date.now() - d.getTime()
  if (diff < 0) return formatDate(d)
  const min = Math.floor(diff / 60000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟前`
  const hour = Math.floor(min / 60)
  if (hour < 24) return `${hour} 小时前`
  const day = Math.floor(hour / 24)
  if (day < 30) return `${day} 天前`
  return formatDate(d)
}

/** 1.2 MB */
export function formatFileSize(bytes) {
  if (bytes === null || bytes === undefined || bytes === '') return '-'
  const n = Number(bytes)
  if (Number.isNaN(n)) return '-'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(2)} MB`
}

/** 大数字简写：12800 → 1.3万 */
export function formatCount(n) {
  const v = Number(n) || 0
  if (v < 1000) return String(v)
  if (v < 10000) return `${(v / 1000).toFixed(1)}k`
  return `${(v / 10000).toFixed(1)}万`
}

/** 去掉扩展名的文件名 */
export function stripExt(name) {
  if (!name) return ''
  const i = name.lastIndexOf('.')
  return i > 0 ? name.slice(0, i) : name
}

/** 标签输入串 "海边, 日落" → ['海边','日落']（去空、去重、限长） */
export function parseTags(input, max = 10) {
  const raw = Array.isArray(input) ? input : String(input ?? '').split(',')
  const seen = new Set()
  const out = []
  for (const item of raw) {
    const t = String(item).trim()
    if (!t || seen.has(t)) continue
    seen.add(t)
    out.push(t.slice(0, 30))
    if (out.length >= max) break
  }
  return out
}

/** 数组 → 标签输入串 */
export function joinTags(tags) {
  return Array.isArray(tags) ? tags.join(', ') : ''
}

/** 计算等比缩放后的显示尺寸，用于详情页预览不撑破布局 */
export function fitSize(w, h, maxW, maxH) {
  if (!w || !h) return { width: maxW, height: maxH }
  const ratio = Math.min(maxW / w, maxH / h, 1)
  return { width: Math.round(w * ratio), height: Math.round(h * ratio) }
}