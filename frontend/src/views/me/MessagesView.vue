<template>
  <div class="u-page">
    <div class="page-container">
      <div class="page-head">
        <div>
          <div class="page-head__title">Messages</div>
          <div class="page-head__desc">Message creators one to one, or catch up on people you follow</div>
        </div>
        <div class="page-head__tools">
          <el-button v-if="tab === 'notice' && unreadNoticeCount" link @click="onReadAllNotices">
            Mark all as read
          </el-button>
          <RubberSegment v-model="tab" :items="tabs" size="sm" aria-label="Message type" />
        </div>
      </div>

      <!-- 私信：左列表 + 右聊天 -->
      <div v-if="tab === 'chat'" class="msg" :class="{ 'msg--chat-open': !!activeUsername }">
        <aside class="msg__side u-panel">
          <div v-if="convLoading && !conversations.length" class="msg__hint">Loading…</div>

          <EmptyState
            v-else-if="!conversations.length"
            compact
            title="No messages yet"
            description="Start a conversation from a creator's profile or a photo page"
          />

          <ul v-else class="convs">
            <li v-for="c in conversations" :key="c.id">
              <button
                type="button"
                class="conv"
                :class="{ 'conv--active': c.peer.username === activeUsername }"
                @click="openChat(c.peer.username)"
              >
                <el-avatar :size="32" :src="c.peer.avatar_url || ''" class="conv__avatar">
                  {{ initialOf(c.peer) }}
                </el-avatar>
                <div class="conv__body">
                  <div class="conv__row">
                    <span class="conv__name">{{ c.peer.nickname || c.peer.username }}</span>
                    <span class="conv__time">{{ formatRelative(c.last_message_at) }}</span>
                  </div>
                  <div class="conv__row">
                    <span class="conv__preview">{{ previewOf(c) }}</span>
                    <span v-if="c.unread_count" class="conv__badge">{{ badgeOf(c.unread_count) }}</span>
                  </div>
                </div>
              </button>
            </li>
          </ul>

          <div v-if="conversations.length < convTotal" class="msg__more">
            <el-button link :loading="convLoadingMore" @click="loadMoreConvs">Load more</el-button>
          </div>
        </aside>

        <section class="msg__main u-panel">
          <template v-if="activeUsername">
            <!-- 头部：对端信息 + 关注 / 屏蔽 -->
            <header class="chat__head">
              <el-button class="chat__back" link @click="backToList">Back</el-button>
              <el-avatar :size="34" :src="peer?.avatar_url || ''" class="conv__avatar">
                {{ initialOf(peer) }}
              </el-avatar>
              <div class="chat__who">
                <div class="chat__name">{{ peer?.nickname || activeUsername }}</div>
                <div class="chat__handle">@{{ activeUsername }}</div>
              </div>
              <div v-if="peer" class="chat__actions">
                <FollowButton
                  :username="activeUsername"
                  :is-following="peer.is_following"
                  size="small"
                  @update:is-following="peer.is_following = $event"
                />
                <el-button link type="danger" @click="onBlock">Block</el-button>
              </div>
            </header>

            <!-- 消息区 -->
            <div ref="chatBody" class="chat__body">
              <div v-if="hasMore" class="chat__history">
                <el-button link :loading="historyLoading" @click="loadOlder">Load earlier messages</el-button>
              </div>
              <div v-if="chatLoading && !messages.length" class="msg__hint">Loading…</div>
              <template v-for="b in bubbles" :key="b.id">
                <div v-if="b.dayLabel" class="chat__day">{{ b.dayLabel }}</div>
                <div class="chat__line" :class="{ 'chat__line--mine': b.mine }">
                  <div class="chat__bubble" :class="{ 'chat__bubble--mine': b.mine }">
                    <div v-if="b.showTime" class="chat__stamp">{{ b.time }}</div>
                    <div class="chat__text" :class="{ 'chat__text--emoji': b.emojiOnly }">{{ b.content }}</div>
                  </div>
                </div>
              </template>
              <EmptyState
                v-if="!chatLoading && !messages.length"
                compact
                title="No messages yet"
                :description="`Say hello to ${peer?.nickname || activeUsername}`"
              />
            </div>

            <!-- 输入区 -->
            <footer class="chat__foot">
              <EmojiPicker @select="insertEmoji" />
              <el-input
                ref="draftInput"
                v-model="draft"
                type="textarea"
                :autosize="{ minRows: 1, maxRows: 4 }"
                resize="none"
                maxlength="2000"
                placeholder="Type a message. Enter to send, Shift + Enter for a new line"
                @keydown.enter.exact.prevent="onSend"
              />
              <el-button type="primary" :loading="sending" :disabled="!draft.trim()" @click="onSend">
                Send
              </el-button>
            </footer>
          </template>

          <EmptyState
            v-else
            title="Select a conversation"
            description="Or start a new conversation from a creator's profile"
          />
        </section>
      </div>

      <!-- 通知：整宽列表 -->
      <div v-else class="u-panel list-wide">
        <div v-if="noticeLoading && !notices.length" class="msg__hint">Loading…</div>

        <EmptyState
          v-else-if="!notices.length"
          title="No notifications yet"
          description="Follow creators to hear about new work when they publish"
        >
          <el-button type="primary" @click="router.push('/')">Explore</el-button>
        </EmptyState>

        <ul v-else class="notifs">
          <li v-for="n in notices" :key="n.id">
            <button
              type="button"
              class="notif"
              :class="{ 'notif--unread': !n.is_read }"
              @click="openNotice(n)"
            >
              <el-avatar :size="34" :src="n.actor?.avatar_url || ''" class="conv__avatar">
                {{ initialOf(n.actor) }}
              </el-avatar>
              <span class="notif__text">{{ n.title }}</span>
              <span class="notif__time">{{ formatRelative(n.created_at) }}</span>
              <img v-if="n.thumb_url" class="notif__thumb" :src="n.thumb_url" alt="" />
            </button>
          </li>
        </ul>

        <div v-if="notices.length < noticeTotal" class="msg__more">
          <el-button :loading="noticeLoadingMore" @click="loadMoreNotices">Load more</el-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import EmptyState from '@/components/common/EmptyState.vue'
import RubberSegment from '@/components/common/RubberSegment.vue'
import EmojiPicker from '@/components/social/EmojiPicker.vue'
import FollowButton from '@/components/social/FollowButton.vue'
import { listMessages, listConversations, markConversationRead, sendMessage } from '@/api/modules/messages'
import { listNotifications, markNotificationsRead } from '@/api/modules/notifications'
import { blockUser } from '@/api/modules/social'
import { getUserProfile } from '@/api/modules/users'
import { useAuthStore } from '@/stores/auth'
import { useRealtimeStore } from '@/stores/realtime'
import { formatDate, formatDateTime, formatRelative } from '@/utils/format'

const PAGE_SIZE = 20
const MSG_SIZE = 30

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const rt = useRealtimeStore()

const tab = ref(route.query.tab === 'notice' ? 'notice' : 'chat')
const tabs = [
  { value: 'chat', label: 'Messages' },
  { value: 'notice', label: 'Notifications' },
]

// ---------------- 私信 ----------------
const conversations = ref([])
const convTotal = ref(0)
const convPage = ref(1)
const convLoading = ref(true)
const convLoadingMore = ref(false)

const messages = ref([])
const hasMore = ref(false)
const nextBeforeId = ref(null)
const chatLoading = ref(false)
const historyLoading = ref(false)
const sending = ref(false)
const draft = ref('')
const draftInput = ref(null)
const chatBody = ref(null)
const peer = ref(null)

const activeUsername = computed(() =>
  tab.value === 'chat' && route.query.u ? String(route.query.u) : '',
)

// 当前会话 id：未读/推送归属判断要用（新会话还没进列表时为 null）
const activeConvId = computed(
  () => conversations.value.find((c) => c.peer.username === activeUsername.value)?.id ?? null,
)

// 同分钟不重复显示时间；跨天插一条居中的日期分隔
const bubbles = computed(() => {
  const out = []
  let lastDay = null
  let lastStamp = null
  for (const m of messages.value) {
    const day = formatDate(m.created_at)
    const stamp = formatDateTime(m.created_at)
    const newDay = day !== lastDay
    out.push({
      id: m.id,
      mine: m.sender_id === auth.userId,
      content: m.content,
      emojiOnly: isEmojiOnly(m.content),
      time: stamp.slice(11),
      showTime: newDay || stamp !== lastStamp,
      dayLabel: newDay ? dayLabel(day) : null,
    })
    lastDay = day
    lastStamp = stamp
  }
  return out
})

function dayLabel(day) {
  if (day === formatDate(new Date())) return 'Today'
  const y = new Date()
  y.setDate(y.getDate() - 1)
  if (day === formatDate(y)) return 'Yesterday'
  return day
}

// 只有表情、没有文字的消息按手机聊天的习惯放大显示
const EMOJI_CHARS = /^[\p{Extended_Pictographic}\p{Emoji_Modifier}\uFE0F\u200D]+$/u

function isEmojiOnly(text) {
  const compact = (text || '').replace(/\s+/g, '')
  if (!compact) return false
  return /^\p{Extended_Pictographic}/u.test(compact) && EMOJI_CHARS.test(compact)
}

// 表情插到光标处，不是简单追加到末尾；插完把光标放回表情后面
function insertEmoji(emoji) {
  const el = draftInput.value?.textarea
  const value = draft.value
  const start = el?.selectionStart ?? value.length
  const end = el?.selectionEnd ?? value.length
  draft.value = value.slice(0, start) + emoji + value.slice(end)
  nextTick(() => {
    if (!el) return
    const pos = start + emoji.length
    el.focus()
    el.setSelectionRange(pos, pos)
  })
}

function initialOf(u) {
  return (u?.nickname || u?.username || 'U').slice(0, 1).toUpperCase()
}

function badgeOf(n) {
  return n > 99 ? '99+' : String(n)
}

function previewOf(c) {
  const prefix = c.last_sender_id === auth.userId ? 'You: ' : ''
  return `${prefix}${c.last_message_preview || ''}` || 'No messages yet'
}

async function loadConversations(reset = true) {
  if (reset) {
    convLoadingMore.value = false
  } else {
    convLoadingMore.value = true
  }
  try {
    const target = reset ? 1 : convPage.value + 1
    const data = await listConversations({ page: target, size: PAGE_SIZE })
    const rows = data?.items || []
    conversations.value = reset ? rows : conversations.value.concat(rows)
    convTotal.value = data?.total || 0
    convPage.value = target
  } catch {
    if (reset) {
      conversations.value = []
      convTotal.value = 0
    }
  } finally {
    convLoading.value = false
    convLoadingMore.value = false
  }
}

function loadMoreConvs() {
  loadConversations(false)
}

function openChat(username) {
  router.push({ query: { ...route.query, tab: 'chat', u: username } })
}

function backToList() {
  router.push({ query: { tab: 'chat' } })
}

async function loadActiveConversation() {
  const username = activeUsername.value
  if (!username) {
    messages.value = []
    peer.value = null
    hasMore.value = false
    nextBeforeId.value = null
    rt.setViewingUser(null)
    return
  }

  chatLoading.value = true
  try {
    const data = await listMessages(username, { limit: MSG_SIZE })
    messages.value = data?.items || []
    hasMore.value = !!data?.has_more
    nextBeforeId.value = data?.next_before_id ?? null
    await nextTick()
    scrollToBottom(true)
    // 打开会话即标记已读：把该会话的未读清掉并同步列表角标与红点
    try {
      await markConversationRead(username)
      const c = conversations.value.find((x) => x.peer.username === username)
      if (c) c.unread_count = 0
      rt.refreshUnread()
    } catch {
      // 标记失败不影响阅读
    }
  } catch {
    messages.value = []
  } finally {
    chatLoading.value = false
  }
  loadPeer(username)
}

async function loadPeer(username) {
  try {
    peer.value = await getUserProfile(username)
  } catch {
    peer.value = { username }
  }
  // 告诉实时层「我正在看谁」，这样对方发消息过来时不会给自己看到的会话加未读
  rt.setViewingUser(peer.value?.id ?? null)
}

// ---------------- 实时推送 ----------------

// 归属判断：优先用会话 id（会话已在列表里），退化到对端 id（新会话还没进列表）
function belongsToActive(payload) {
  if (!activeUsername.value) return false
  if (activeConvId.value && payload.conversation_id === activeConvId.value) return true
  return !!peer.value && payload.sender_id === peer.value.id
}

/** 把断线期间漏掉的消息按 after_id 增量补齐 */
async function syncMissed() {
  const username = activeUsername.value
  const last = messages.value[messages.value.length - 1]
  if (!username || !last) return
  try {
    const data = await listMessages(username, { after_id: last.id })
    const rows = data?.items || []
    const fresh = rows.filter((m) => !messages.value.some((x) => x.id === m.id))
    if (!fresh.length) return
    messages.value.push(...fresh)
    bumpConversation(fresh[fresh.length - 1])
    await nextTick()
    scrollToBottom()
  } catch {
    // 静默失败：下一次勾兑会带上，不影响已有内容
  }
}

function onPush(payload) {
  const type = payload?.type

  if (type === 'message') {
    const msg = payload.message
    if (!msg) return
    // 别的会话来了新消息：只刷列表拿最新预览和未读角标，不动当前对话
    if (!belongsToActive(payload)) {
      loadConversations()
      return
    }
    if (!messages.value.some((m) => m.id === msg.id)) {
      messages.value.push(msg)
      bumpConversation(msg)
      nextTick(() => scrollToBottom())
    }
    if (msg.sender_id !== auth.userId) {
      const c = conversations.value.find((x) => x.peer.username === activeUsername.value)
      if (c) c.unread_count = 0
      markConversationRead(activeUsername.value)
        .then(() => rt.refreshUnread())
        .catch(() => {})
    }
    // 首次收到对端消息时会话还没进列表，补拉一次让它出现
    if (!activeConvId.value) loadConversations()
    return
  }

  if (type === 'notification') {
    if (tab.value === 'notice') loadNotices()
    return
  }

  // 重连成功：补齐断线期间可能漏掉的消息
  if (type === 'open') syncMissed()
}

let gapTimer = null

/** 没有实时连接时，改成 5 秒增量轮询兜底，保证消息仍能到达 */
function syncGapPolling() {
  if (gapTimer) clearInterval(gapTimer)
  gapTimer = null
  if (rt.status === 'open' || !activeUsername.value) return
  gapTimer = setInterval(syncMissed, 5000)
}

async function loadOlder() {
  if (!hasMore.value || historyLoading.value || !nextBeforeId.value) return
  const el = chatBody.value
  const prevHeight = el ? el.scrollHeight : 0
  historyLoading.value = true
  try {
    const data = await listMessages(activeUsername.value, {
      before_id: nextBeforeId.value,
      limit: MSG_SIZE,
    })
    messages.value = (data?.items || []).concat(messages.value)
    hasMore.value = !!data?.has_more
    nextBeforeId.value = data?.next_before_id ?? null
    await nextTick()
    // 补完历史后把视口钉在原处，不让用户往上翻的内容跳动
    if (el) el.scrollTop = el.scrollHeight - prevHeight
  } catch {
    // http 层已提示
  } finally {
    historyLoading.value = false
  }
}

async function onSend() {
  const text = draft.value.trim()
  if (!text || sending.value || !activeUsername.value) return
  sending.value = true
  try {
    const msg = await sendMessage(activeUsername.value, text)
    // 自己刚发的消息用 id 去重：WS 推送回来时不会重复上屏
    if (!messages.value.some((m) => m.id === msg.id)) messages.value.push(msg)
    draft.value = ''
    bumpConversation(msg)
    await nextTick()
    scrollToBottom(true)
  } catch {
    // http 层已提示（被屏蔽时是 403 BLOCKED）
  } finally {
    sending.value = false
  }
}

function bumpConversation(msg) {
  const c = conversations.value.find((x) => x.peer.username === activeUsername.value)
  if (!c) {
    loadConversations()
    return
  }
  c.last_message_preview =
    msg.content.length > 120 ? `${msg.content.slice(0, 117)}...` : msg.content
  c.last_message_at = msg.created_at
  c.last_sender_id = msg.sender_id
}

function scrollToBottom(force = false) {
  const el = chatBody.value
  if (!el) return
  // 只在已经贴着底部时才自动滚，避免打断向上翻历史的用户
  const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 60
  if (force || atBottom) el.scrollTop = el.scrollHeight
}

async function onBlock() {
  if (!peer.value) return
  const name = peer.value.nickname || activeUsername.value
  try {
    await ElMessageBox.confirm(
      `You and ${name} will no longer be able to message each other, and your follows will be removed.`,
      'Block user',
      { type: 'warning', confirmButtonText: 'Block', confirmButtonClass: 'el-button--danger' },
    )
  } catch {
    return
  }
  try {
    await blockUser(activeUsername.value)
    if (peer.value) peer.value.is_following = false
    ElMessage.success('User blocked')
    loadConversations()
  } catch {
    // http 层已提示
  }
}

// ---------------- 通知 ----------------
const notices = ref([])
const noticeTotal = ref(0)
const noticePage = ref(1)
const noticeLoading = ref(true)
const noticeLoadingMore = ref(false)
const unreadNoticeCount = computed(() => notices.value.filter((n) => !n.is_read).length)

async function loadNotices(reset = true) {
  if (reset) {
    noticeLoading.value = true
  } else {
    noticeLoadingMore.value = true
  }
  try {
    const target = reset ? 1 : noticePage.value + 1
    const data = await listNotifications({ page: target, size: PAGE_SIZE })
    const rows = data?.items || []
    notices.value = reset ? rows : notices.value.concat(rows)
    noticeTotal.value = data?.total || 0
    noticePage.value = target
  } catch {
    if (reset) {
      notices.value = []
      noticeTotal.value = 0
    }
  } finally {
    noticeLoading.value = false
    noticeLoadingMore.value = false
  }
}

function loadMoreNotices() {
  loadNotices(false)
}

async function openNotice(n) {
  if (!n.is_read) {
    n.is_read = true
    try {
      await markNotificationsRead([n.id])
    } catch {
      // 标记失败不回滚 UI：下次进页面会重新校正
    }
    rt.refreshUnread()
  }
  if (n.image_id) {
    router.push({ name: 'photo', params: { id: n.image_id } })
  }
}

async function onReadAllNotices() {
  notices.value.forEach((n) => {
    n.is_read = true
  })
  try {
    await markNotificationsRead(null)
  } catch {
    // 交给下次 refreshUnread 校正
  }
  rt.refreshUnread()
}

// ---------------- 生命周期 ----------------
watch(tab, (v) => {
  router.replace({ query: { ...route.query, tab: v } })
  if (v === 'notice') loadNotices()
})

watch(activeUsername, () => {
  loadActiveConversation()
  syncGapPolling()
})

// 连接断开 / 降级轮询时切到 5s 增量补齐，恢复后自动停掉
watch(() => rt.status, syncGapPolling)

let unsubscribePush = null

onMounted(() => {
  unsubscribePush = rt.subscribe(onPush)
  loadConversations()
  rt.refreshUnread()
  if (tab.value === 'notice') {
    loadNotices()
  } else if (activeUsername.value) {
    loadActiveConversation()
  }
  syncGapPolling()
})

onUnmounted(() => {
  if (unsubscribePush) unsubscribePush()
  unsubscribePush = null
  if (gapTimer) clearInterval(gapTimer)
  gapTimer = null
  rt.setViewingUser(null)
})
</script>

<style lang="scss" scoped>
.page-head__tools {
  display: flex;
  align-items: center;
  gap: 12px;
}

// 空态自带底色，放在玻璃面板里会把面板割成两半，这里让它透出面板底色
.msg :deep(.empty) {
  background: transparent;
  border-color: $color-border;
}

.msg {
  display: grid;
  grid-template-columns: 320px minmax(0, 1fr);
  gap: 16px;
  min-height: 560px;
}

.msg__side {
  display: flex;
  flex-direction: column;
  padding: 10px;
  overflow: hidden;
}

.msg__main {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  overflow: hidden;
}

.msg__hint {
  padding: 16px;
  font-size: 13px;
  color: $color-text-muted;
  text-align: center;
}

.msg__more {
  display: flex;
  justify-content: center;
  padding: 10px 0 4px;
}

// ---------------- 会话列表 ----------------
.convs {
  flex: 1 1 auto;
  margin: 0;
  padding: 0;
  list-style: none;
  overflow-y: auto;
}

.conv {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 9px 10px;
  border: none;
  border-radius: $radius-base;
  background: transparent;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s ease;

  &:hover {
    background: rgba(0, 113, 227, 0.05);
  }

  &:focus-visible {
    @include focus-ring;
  }
}

// 选中：淡主色块 + 左侧 2px 主色条，比整块实心色克制
.conv--active {
  background: rgba(0, 113, 227, 0.07);
  box-shadow: inset 2px 0 0 $color-primary;
}

.conv__avatar {
  flex: none;
  background: $color-primary-soft;
  color: $color-primary;
  font-weight: 600;
}

.conv__body {
  flex: 1 1 auto;
  min-width: 0;
}

.conv__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.conv__name {
  font-size: 13px;
  font-weight: 600;
  color: $color-text;

  @include ellipsis;
}

.conv__time {
  flex: none;
  font-size: 11px;
  color: $color-text-muted;
  font-variant-numeric: tabular-nums;
}

.conv__preview {
  font-size: 12px;
  color: $color-text-secondary;

  @include ellipsis;
}

.conv__badge {
  flex: none;
  min-width: 16px;
  height: 16px;
  padding-inline: 4px;
  border-radius: 999px;
  background: $color-danger;
  color: #fff;
  font-size: 10px;
  font-weight: 600;
  line-height: 16px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

// ---------------- 聊天 ----------------
.chat__head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-bottom: 1px solid $color-border;
}

.chat__back {
  display: none;
}

.chat__who {
  flex: 1 1 auto;
  min-width: 0;
}

.chat__name {
  font-size: 14px;
  font-weight: 600;
  color: $color-text;

  @include ellipsis;
}

.chat__handle {
  font-size: 12px;
  color: $color-text-muted;
}

.chat__actions {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
}

.chat__body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 16px;
  overflow-y: auto;
}

.chat__history {
  display: flex;
  justify-content: center;
  padding-bottom: 8px;
}

.chat__day {
  align-self: center;
  margin: 10px 0 6px;
  padding: 2px 10px;
  border-radius: 999px;
  background: $color-bg-hover;
  color: $color-text-muted;
  font-size: 11px;
}

.chat__line {
  display: flex;
  justify-content: flex-start;
}

.chat__line--mine {
  justify-content: flex-end;
}

.chat__bubble {
  max-width: min(70%, 520px);
  padding: 8px 12px;
  border-radius: 18px 18px 18px 6px;
  background: $color-bg-hover;
  border: 1px solid transparent;
  box-shadow: none;
}

.chat__bubble--mine {
  border-radius: 18px 18px 6px 18px;
  // 纯色苹果蓝气泡，白字保证对比度
  background: $color-primary;
  border-color: transparent;
  color: #ffffff;
  box-shadow: 0 2px 10px -6px rgba(0, 0, 0, 0.5);
}

.chat__stamp {
  margin-bottom: 3px;
  font-size: 10px;
  color: $color-text-muted;
  font-variant-numeric: tabular-nums;
}

.chat__bubble--mine .chat__stamp {
  color: rgba(255, 255, 255, 0.72);
}

.chat__text {
  font-size: 13px;
  line-height: 1.5;
  color: inherit;
  white-space: pre-wrap;
  word-break: break-word;
}

// 纯表情消息：字号放大、去掉行距，读起来就是一颗大表情
.chat__text--emoji {
  font-size: 30px;
  line-height: 1.25;
  letter-spacing: 0.02em;
}

.chat__foot {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  padding: 12px 16px;
  border-top: 1px solid $color-border;

  :deep(.el-input) {
    flex: 1 1 auto;
  }

  :deep(.el-textarea__inner) {
    border-radius: $radius-base;
    background: $color-bg-hover;
  }
}

// ---------------- 通知 ----------------
.notifs {
  margin: 0;
  padding: 8px;
  list-style: none;
}

.notif {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 10px 12px;
  border: none;
  border-radius: $radius-base;
  background: transparent;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s ease;

  &:hover {
    background: rgba(0, 113, 227, 0.05);
  }

  &:focus-visible {
    @include focus-ring;
  }
}

// 未读：左侧一条主色竖条，比整块变色克制
.notif--unread {
  box-shadow: inset 3px 0 0 $color-primary;
}

.notif__text {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 13px;
  color: $color-text;

  @include ellipsis;
}

.notif__time {
  flex: none;
  font-size: 12px;
  color: $color-text-muted;
  font-variant-numeric: tabular-nums;
}

.notif__thumb {
  flex: none;
  width: 40px;
  height: 40px;
  object-fit: cover;
  border-radius: $radius-sm;
  background: $color-bg-sunken;
}

// ---------------- 窄屏：单栏 ----------------
@include respond($bp-md) {
  .msg {
    grid-template-columns: minmax(0, 1fr);
    min-height: 0;
  }

  .msg__side {
    max-height: 70vh;
  }

  // 打开会话时只留聊天，列表让位
  .msg--chat-open .msg__side {
    display: none;
  }

  .chat__back {
    display: inline-flex;
  }

  .msg__main {
    min-height: 70vh;
  }
}
</style>