/**
 * 后台角标状态。
 *
 * 侧栏「内容审核」上的红点挂在 AdminLayout 上，而审核动作发生在 AuditView 里，
 * 两者隔着 router-view 没有父子关系，谁也没法直接改对方的 ref。
 * 所以把待审数放进 store：谁改动了待审数量，谁负责 refreshPending()，
 * 不用为了一个红点让管理员手动刷整页。
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'

import { getAuditStats } from '@/api/modules/admin'

export const useAdminStore = defineStore('admin', () => {
  const pending = ref(0)

  async function refreshPending() {
    try {
      const stats = await getAuditStats()
      pending.value = stats?.pending ?? 0
    } catch {
      // 拿不到就保持旧值：红点不因一次网络抖动而闪烁或消失
    }
  }

  return { pending, refreshPending }
})
