import { ref } from 'vue'

import { downloadImage } from '@/api/modules/images'

/** 用一个隐藏的 <a> 触发浏览器下载（同源路径，download 属性有效） */
function saveAs(url, filename) {
  const a = document.createElement('a')
  a.href = url
  if (filename) a.download = filename
  a.rel = 'noopener'
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

/**
 * 下载：先向后端要地址（后端借此记录 downloads 明细并自增计数），
 * 再交给浏览器保存。
 */
export function useDownload() {
  const busy = ref(false)
  const activeVariant = ref('')

  async function download(imageId, variant = 'original') {
    if (busy.value) return null
    busy.value = true
    activeVariant.value = variant
    try {
      const res = await downloadImage(imageId, variant)
      saveAs(res.url, res.filename)
      return res
    } catch (error) {
      ElMessage.error(error.friendlyMessage || '下载失败，请稍后重试')
      return null
    } finally {
      busy.value = false
      activeVariant.value = ''
    }
  }

  return { busy, activeVariant, download }
}