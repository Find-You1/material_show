<template>
  <div class="u-page">
    <div class="page-container">
      <div class="page-head settings__head">
        <div>
          <div class="page-head__title">Settings</div>
          <div class="page-head__desc">Manage your profile and password</div>
        </div>
      </div>

      <div class="settings">
        <!-- 身份卡：先把「你是谁」摆出来，再往下才是可改的字段 -->
        <section class="idcard u-panel">
          <div class="idcard__avatar">
            <el-avatar :size="92" :src="auth.user?.avatar_url || ''" class="idcard__img">
              {{ avatarFallback }}
            </el-avatar>
            <button
              type="button"
              class="idcard__cam"
              :disabled="uploadingAvatar"
              aria-label="Change avatar"
              @click="pickAvatar"
            >
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                <path
                  d="M4.6 8.4h2.7l1.3-2h6.8l1.3 2h2.7c.7 0 1.2.5 1.2 1.2v8.2c0 .7-.5 1.2-1.2 1.2H4.6c-.7 0-1.2-.5-1.2-1.2v-8.2c0-.7.5-1.2 1.2-1.2Z"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.5"
                  stroke-linejoin="round"
                />
                <circle cx="12" cy="14" r="3.1" fill="none" stroke="currentColor" stroke-width="1.5" />
              </svg>
            </button>
            <input
              ref="fileInput"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              class="idcard__input"
              @change="onAvatarPicked"
            />
          </div>

          <div class="idcard__main">
            <span class="idcard__eyebrow">Signed in as</span>
            <h2 class="idcard__name">{{ auth.user?.nickname || auth.user?.username }}</h2>
            <div class="idcard__handle">@{{ auth.user?.username }}</div>
            <div class="idcard__chips">
              <span class="chip" :class="{ 'chip--admin': auth.isAdmin }">
                {{ auth.isAdmin ? 'Admin' : 'Member' }}
              </span>
              <span class="chip">Joined {{ formatDate(auth.user?.created_at) }}</span>
            </div>
          </div>

          <div class="idcard__aside">
            <div class="idcard__hint">Square images work best, up to 2MB</div>
            <div class="idcard__btns">
              <el-button :loading="uploadingAvatar" @click="pickAvatar">Upload image</el-button>
              <el-button v-if="auth.user?.avatar_url" link @click="dropAvatar">Remove</el-button>
            </div>
          </div>
        </section>

        <div class="settings__cols">
          <!-- 01 Profile：唯一的编辑主区，占宽栏 -->
          <section class="card u-panel">
            <header class="card__head">
              <span class="card__index">01</span>
              <div>
                <h3 class="card__title">Profile</h3>
                <p class="card__desc">How your name and bio appear next to your frames</p>
              </div>
            </header>

            <el-form :model="profile" label-position="top" class="card__form">
              <el-form-item label="Nickname">
                <el-input
                  v-model="profile.nickname"
                  maxlength="50"
                  placeholder="The name shown with your works"
                />
              </el-form-item>
              <el-form-item label="Bio">
                <el-input
                  v-model="profile.bio"
                  type="textarea"
                  :rows="4"
                  maxlength="255"
                  show-word-limit
                  placeholder="Tell people about yourself or the subjects you shoot"
                />
              </el-form-item>
            </el-form>

            <div class="card__actions">
              <el-button type="primary" :loading="savingProfile" @click="saveProfile">
                Save changes
              </el-button>
            </div>
          </section>

          <aside class="settings__side">
            <!-- 02 Account：只读事实，做成清单不占表单宽度 -->
            <section class="card u-panel">
              <header class="card__head">
                <span class="card__index">02</span>
                <div>
                  <h3 class="card__title">Account</h3>
                  <p class="card__desc">Issued when you signed up</p>
                </div>
              </header>

              <dl class="facts">
                <div class="facts__row">
                  <dt>Username</dt>
                  <dd>{{ auth.user?.username }}</dd>
                </div>
                <div class="facts__row">
                  <dt>Email</dt>
                  <dd class="facts__value--email">{{ auth.user?.email }}</dd>
                </div>
                <div class="facts__row">
                  <dt>Role</dt>
                  <dd>{{ auth.isAdmin ? 'Admin' : 'Member' }}</dd>
                </div>
                <div class="facts__row">
                  <dt>Joined</dt>
                  <dd>{{ formatDate(auth.user?.created_at) }}</dd>
                </div>
              </dl>
            </section>

            <!-- 03 Password -->
            <section class="card u-panel">
              <header class="card__head">
                <span class="card__index">03</span>
                <div>
                  <h3 class="card__title">Password</h3>
                  <p class="card__desc">Use 6 to 24 characters</p>
                </div>
              </header>

              <el-form :model="pwd" label-position="top" class="card__form">
                <el-form-item label="Current password">
                  <el-input v-model="pwd.old_password" type="password" show-password />
                </el-form-item>
                <el-form-item label="New password">
                  <el-input
                    v-model="pwd.new_password"
                    type="password"
                    show-password
                    placeholder="6-24 characters"
                  />
                </el-form-item>
                <el-form-item label="Confirm new password">
                  <el-input v-model="pwd.confirm" type="password" show-password />
                </el-form-item>
              </el-form>

              <div class="card__actions">
                <el-button :loading="savingPwd" @click="savePassword">Update password</el-button>
              </div>
            </section>

            <!-- 04 Privacy：只留一个入口，不再孤零零挂在页脚 -->
            <section class="card u-panel">
              <header class="card__head">
                <span class="card__index">04</span>
                <div>
                  <h3 class="card__title">Privacy</h3>
                  <p class="card__desc">People you block can no longer message or follow you</p>
                </div>
              </header>

              <router-link to="/me/blocks" class="facts-link">
                <span>Manage blocked users</span>
                <span class="facts-link__arrow" aria-hidden="true">→</span>
              </router-link>
            </section>
          </aside>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'

import { changePassword, removeAvatar, updateMe, uploadAvatar } from '@/api/modules/auth'
import { useAuthStore } from '@/stores/auth'
import { AVATAR_MAX_MB } from '@/utils/constants'
import { formatDate } from '@/utils/format'

const auth = useAuthStore()

const profile = reactive({ nickname: '', bio: '' })
const pwd = reactive({ old_password: '', new_password: '', confirm: '' })

const savingProfile = ref(false)
const savingPwd = ref(false)

// 头像：不用 el-upload，它自带列表/进度/拖拽 DOM，和这一页的简洁表单不搭
const fileInput = ref(null)
const uploadingAvatar = ref(false)
const avatarFallback = computed(() =>
  (auth.user?.nickname || auth.user?.username || 'U').slice(0, 1).toUpperCase(),
)

onMounted(async () => {
  try {
    const user = await auth.fetchMe()
    if (user) fillProfile(user)
  } catch {
    fillProfile(auth.user || {})
  }
})

function fillProfile(user) {
  profile.nickname = user.nickname || ''
  profile.bio = user.bio || ''
}

async function saveProfile() {
  if (!profile.nickname.trim()) {
    ElMessage.warning('Enter a nickname')
    return
  }
  savingProfile.value = true
  try {
    const user = await updateMe({
      nickname: profile.nickname.trim(),
      bio: profile.bio.trim(),
    })
    auth.setUser(user)
    ElMessage.success('Profile updated')
  } catch {
    // http 层已提示
  } finally {
    savingProfile.value = false
  }
}

function pickAvatar() {
  fileInput.value?.click()
}

async function onAvatarPicked(event) {
  const file = event.target.files?.[0]
  // 先清空，否则连续选同一个文件不会再触发 change
  event.target.value = ''
  if (!file) return
  if (!file.type.startsWith('image/')) {
    ElMessage.warning('Choose an image file')
    return
  }
  if (file.size > AVATAR_MAX_MB * 1024 * 1024) {
    ElMessage.warning(`Avatars can be up to ${AVATAR_MAX_MB}MB`)
    return
  }

  uploadingAvatar.value = true
  try {
    const user = await uploadAvatar(file)
    auth.setUser(user)
    ElMessage.success('Avatar updated')
  } catch {
    // http 层已提示
  } finally {
    uploadingAvatar.value = false
  }
}

async function dropAvatar() {
  try {
    await removeAvatar()
    await auth.fetchMe()
    ElMessage.success('Avatar removed')
  } catch {
    // http 层已提示
  }
}

async function savePassword() {
  if (!pwd.old_password || !pwd.new_password) {
    ElMessage.warning('Enter your current and new password')
    return
  }
  if (pwd.new_password.length < 6 || pwd.new_password.length > 24) {
    ElMessage.warning('New password must be 6-24 characters')
    return
  }
  if (pwd.new_password !== pwd.confirm) {
    ElMessage.warning('The new passwords do not match')
    return
  }
  savingPwd.value = true
  try {
    await changePassword({ old_password: pwd.old_password, new_password: pwd.new_password })
    ElMessage.success('Password updated. Sign in with your new password')
    pwd.old_password = ''
    pwd.new_password = ''
    pwd.confirm = ''
  } catch {
    // http 层已提示
  } finally {
    savingPwd.value = false
  }
}
</script>

<style lang="scss" scoped>
.settings {
  max-width: 1080px;
  margin-inline: auto;
}

// 标题与卡片共用同一条中轴线，否则窄栏内容会从页面最左侧的标题下「缩」进去
.settings__head {
  max-width: 1080px;
  margin-inline: auto;
}

// ---------------- 身份卡 ----------------
// 玻璃面板上再叠一层很淡的中性顶光，把「头像 + 名字」这一块抬成页面的视觉起点
.idcard {
  position: relative;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: clamp(18px, 2.4vw, 28px);
  padding: 24px clamp(20px, 2.6vw, 30px);
  overflow: hidden;

  &::before {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.6) 0%, rgba(255, 255, 255, 0) 62%);
  }

  > * {
    position: relative;
  }

  @include respond($bp-md) {
    grid-template-columns: auto minmax(0, 1fr);
  }

  @include respond($bp-sm) {
    grid-template-columns: minmax(0, 1fr);
    gap: 16px;
    justify-items: start;
  }
}

.idcard__avatar {
  position: relative;
  flex: none;
}

.idcard__img {
  background: $color-primary-soft;
  color: $color-primary;
  font-size: 32px;
  font-weight: 600;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.05), 0 12px 28px -14px rgba(0, 0, 0, 0.4);
}

.idcard__cam {
  position: absolute;
  right: -2px;
  bottom: -2px;
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  padding: 0;
  border-radius: 50%;
  border: 1px solid $color-border;
  background: $color-bg-card;
  color: $color-text-secondary;
  cursor: pointer;
  transition: color 0.18s ease, background 0.18s ease, transform 0.18s ease;

  &:hover {
    color: #ffffff;
    background: $color-primary;
    border-color: $color-primary;
  }

  &:active {
    transform: scale(0.94);
  }

  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
}

.idcard__input {
  display: none;
}

.idcard__main {
  min-width: 0;
}

.idcard__eyebrow {
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: $color-text-muted;
}

.idcard__name {
  margin-top: 6px;
  font-size: 26px;
  font-weight: 700;
  letter-spacing: -0.025em;
  line-height: 1.15;
  color: $color-text;

  @include ellipsis;
}

.idcard__handle {
  margin-top: 3px;
  font-size: 13px;
  color: $color-text-secondary;

  @include ellipsis;
}

.idcard__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.chip {
  display: inline-flex;
  align-items: center;
  height: 24px;
  padding-inline: 10px;
  border-radius: 999px;
  border: 1px solid $color-border;
  background: rgba(255, 255, 255, 0.7);
  font-size: 11px;
  color: $color-text-secondary;
}

.chip--admin {
  color: $color-primary;
  border-color: rgba(0, 113, 227, 0.24);
  background: $color-primary-soft;
}

.idcard__aside {
  flex: none;
  text-align: right;
  padding-left: clamp(20px, 2.4vw, 30px);
  border-left: 1px solid $color-border;

  @include respond($bp-md) {
    grid-column: 1 / -1;
    text-align: left;
    padding-left: 0;
    border-left: none;
    padding-top: 16px;
    border-top: 1px solid $color-border;
  }

  @include respond($bp-sm) {
    grid-column: auto;
  }
}

.idcard__hint {
  font-size: 12px;
  color: $color-text-muted;
}

.idcard__btns {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 10px;

  @include respond($bp-md) {
    justify-content: flex-start;
  }
}

// ---------------- 双栏 ----------------
.settings__cols {
  display: grid;
  grid-template-columns: minmax(0, 1.12fr) minmax(300px, 0.88fr);
  gap: 20px;
  align-items: start;
  margin-top: 20px;

  @include respond($bp-md) {
    grid-template-columns: minmax(0, 1fr);
  }
}

.settings__side {
  display: flex;
  flex-direction: column;
  gap: 20px;
  min-width: 0;
}

// ---------------- 分区卡 ----------------
.card {
  padding: 22px clamp(18px, 2.2vw, 26px) 24px;

  // 玻璃面板上再叠一层实底输入框会显脏，输入区用浅灰填充保持微透
  :deep(.el-input__wrapper),
  :deep(.el-textarea__inner) {
    background: rgba(245, 245, 247, 0.9);
  }
}

// 卡头：编号 + 标题 + 一句说明，下面一条发丝线把「抬头」和「内容」分开
.card__head {
  display: flex;
  align-items: baseline;
  gap: 12px;
  padding-bottom: 14px;
  border-bottom: 1px solid $color-border;
}

.card__index {
  flex: none;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.1em;
  color: $color-text-muted;
  font-variant-numeric: tabular-nums;
}

.card__title {
  font-size: 16px;
  font-weight: 600;
  letter-spacing: -0.012em;
  color: $color-text;
}

.card__desc {
  margin-top: 3px;
  font-size: 12px;
  line-height: 1.5;
  color: $color-text-muted;
}

.card__form {
  margin-top: 18px;

  :deep(.el-form-item:last-child) {
    margin-bottom: 0;
  }
}

// 保存按钮不跟字段挤在一起：先留白，再靠右，读起来是「这一块改完了」
.card__actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px solid $color-border;
}

// ---------------- 只读事实清单 ----------------
.facts {
  margin: 4px 0 0;
}

.facts__row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 14px;
  padding: 10px 0;
  border-bottom: 1px solid $color-border;

  &:last-child {
    border-bottom: none;
    padding-bottom: 0;
  }

  dt {
    flex: none;
    font-size: 12px;
    color: $color-text-muted;
  }

  dd {
    margin: 0;
    min-width: 0;
    font-size: 13px;
    font-weight: 500;
    color: $color-text;
    text-align: right;

    @include ellipsis;
  }
}

.facts__value--email {
  font-weight: 400;
  color: $color-text-secondary;
}

// 隐私入口：整行可点，hover 时箭头往前挪一格
.facts-link {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 14px;
  padding: 12px 14px;
  border-radius: $radius-base;
  background: rgba(245, 245, 247, 0.9);
  font-size: 13px;
  font-weight: 500;
  color: $color-text;

  &:hover {
    color: $color-primary;
  }
}

.facts-link__arrow {
  flex: none;
  font-size: 15px;
  color: $color-text-muted;
  transition: transform 0.2s ease, color 0.2s ease;

  .facts-link:hover & {
    color: $color-primary;
    transform: translateX(3px);
  }
}
</style>
