<template>
  <div class="u-page">
    <div class="page-container">
      <div class="page-head">
        <div>
          <div class="page-head__title">Upload</div>
          <div class="page-head__desc">
            JPG, PNG or WEBP, up to {{ UPLOAD_MAX_MB }}MB each. {{
              isAdmin
                ? 'Admin uploads are approved automatically and appear in the public gallery once processed.'
                : 'Submissions go to review and appear in the public gallery once approved.'
            }}
          </div>
        </div>
        <router-link to="/me/uploads" class="back">My uploads</router-link>
      </div>

      <div class="form-upload">
        <div class="u-panel">
          <!-- 选图 -->
          <el-upload
            drag
            :auto-upload="false"
            :show-file-list="false"
            :accept="UPLOAD_ACCEPT"
            :disabled="busy"
            :on-change="onFileChange"
          >
            <div v-if="previewUrl" class="picker picker--filled">
              <img :src="previewUrl" alt="Preview" class="picker__img" />
              <div class="picker__mask">Click to choose another</div>
            </div>
            <div v-else class="picker">
              <div class="picker__title">Click or drag an image here</div>
              <div class="picker__desc">Use an original at least 1600px wide. Multiple sizes are generated automatically.</div>
            </div>
          </el-upload>

          <div v-if="fileInfo" class="fileinfo">
            <span class="fileinfo__name">{{ fileInfo.name }}</span>
            <span class="fileinfo__size">{{ formatFileSize(fileInfo.size) }}</span>
          </div>

          <el-form
            ref="formRef"
            :model="form"
            :rules="rules"
            label-position="top"
            class="u-mt-24"
          >
            <el-form-item label="Title" prop="title">
              <el-input
                v-model="form.title"
                :maxlength="TITLE_MAX"
                show-word-limit
                placeholder="A short description, e.g. Sunset over a seaside cliff"
              />
            </el-form-item>

            <el-form-item label="Description (optional)" prop="description">
              <el-input
                v-model="form.description"
                type="textarea"
                :rows="3"
                :maxlength="DESC_MAX"
                show-word-limit
                placeholder="Background, usage suggestions, and more"
              />
            </el-form-item>

            <el-form-item label="Category" prop="category_id">
              <GlideSelect
                v-model="form.category_id"
                block
                clearable
                placeholder="Select a category"
                :options="categoryOptions"
                aria-label="Select a category"
              />
            </el-form-item>

            <el-form-item label="Tags (optional)" prop="tags">
              <el-input
                v-model="form.tags"
                placeholder="Separate tags with commas, up to 10, e.g. seaside, sunset, cliff"
              />
            </el-form-item>
          </el-form>

          <!-- 进度区 -->
          <div v-if="stage !== 'idle'" class="progress">
            <div class="progress__row">
              <span class="progress__label">{{ stageText }}</span>
              <StatusTag v-if="processStatus" :status="processStatus" kind="process" />
            </div>
            <el-progress
              :percentage="percent"
              :status="progressStatus"
              :stroke-width="6"
              :show-text="false"
            />
            <p v-if="processError" class="progress__error">{{ processError }}</p>
          </div>

          <div class="actions">
            <el-button
              type="primary"
              :loading="busy"
              :disabled="stage === 'done'"
              @click="submit"
            >
              {{ submitText }}
            </el-button>
            <el-button v-if="stage === 'failed'" @click="reset">Start over</el-button>
            <el-button v-if="stage === 'done'" type="primary" plain @click="goUploads">
              View my uploads
            </el-button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'

import StatusTag from '@/components/common/StatusTag.vue'
import GlideSelect from '@/components/common/GlideSelect.vue'
import { createUpload, getMyUpload } from '@/api/modules/images'
import { getCategories } from '@/api/modules/taxonomy'
import { useAuthStore } from '@/stores/auth'
import {
  DESC_MAX,
  POLL_INTERVAL,
  POLL_TIMEOUT,
  TITLE_MAX,
  UPLOAD_ACCEPT,
  UPLOAD_MAX_MB,
  UPLOAD_MAX_TAGS,
} from '@/utils/constants'
import { formatFileSize, parseTags } from '@/utils/format'

const router = useRouter()
const auth = useAuthStore()

// 管理员上传走 source=official，流水线跑完自动过审，所以不该再提示「等待审核」
const isAdmin = computed(() => auth.isAdmin)

const formRef = ref(null)
const categories = ref([])
const categoryOptions = computed(() => categories.value.map((c) => ({ value: c.id, label: c.name })))
const rawFile = ref(null)
const previewUrl = ref('')
const fileInfo = ref(null)

// idle → uploading → processing → done / failed
const stage = ref('idle')
const percent = ref(0)
const processStatus = ref('')
const processError = ref('')
const uploadId = ref(null)

let pollTimer = null
let pollStartedAt = 0

const form = reactive({
  title: '',
  description: '',
  category_id: null,
  tags: '',
})

const rules = {
  title: [{ required: true, message: 'Enter a title', trigger: 'blur' }],
}

const busy = computed(() => stage.value === 'uploading' || stage.value === 'processing')

const submitText = computed(() => {
  if (stage.value === 'uploading') return 'Uploading…'
  if (stage.value === 'processing') return 'Processing…'
  if (stage.value === 'done') return isAdmin.value ? 'Published' : 'Submitted for review'
  return isAdmin.value ? 'Publish' : 'Submit for review'
})

const progressStatus = computed(() => {
  if (stage.value === 'done') return 'success'
  if (stage.value === 'failed') return 'exception'
  return undefined
})

const stageText = computed(() => {
  const map = {
    uploading: `Uploading ${percent.value}%`,
    processing: 'Image received. Generating sizes and a cover.',
    done: isAdmin.value ? 'Published and now in the public gallery' : 'Submitted and now in the review queue',
    failed: 'Processing failed',
  }
  return map[stage.value] || ''
})

function onFileChange(file) {
  const raw = file?.raw
  if (!raw) return

  if (!UPLOAD_ACCEPT.split(',').includes(raw.type)) {
    ElMessage.error('Only JPG, PNG and WEBP images are supported')
    return
  }
  if (raw.size > UPLOAD_MAX_MB * 1024 * 1024) {
    ElMessage.error(`Images can be up to ${UPLOAD_MAX_MB}MB`)
    return
  }

  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  rawFile.value = raw
  previewUrl.value = URL.createObjectURL(raw)
  fileInfo.value = { name: raw.name, size: raw.size }

  // 标题留空时用文件名兜底，省一次输入
  if (!form.title.trim()) {
    const base = raw.name.replace(/\.[^.]+$/, '')
    form.title = base.slice(0, TITLE_MAX)
  }
}

function stopPoll() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

async function pollOnce() {
  const data = await getMyUpload(uploadId.value)
  percent.value = 100
  processStatus.value = data.process_status

  if (data.process_status === 'ready') {
    stopPoll()
    stage.value = 'done'
    ElMessage.success(isAdmin.value ? 'Published. It is now in the public gallery.' : 'Submitted. An admin will review it.')
    return
  }
  if (data.process_status === 'failed') {
    stopPoll()
    stage.value = 'failed'
    processError.value = data.process_error || 'Processing failed. Try again or use another image.'
    return
  }
  if (Date.now() - pollStartedAt > POLL_TIMEOUT) {
    stopPoll()
    stage.value = 'done'
    ElMessage.warning('This is taking longer than usual. Check My uploads later for the result.')
  }
}

function startPoll() {
  stopPoll()
  pollStartedAt = Date.now()
  pollTimer = setInterval(() => {
    pollOnce().catch(() => {
      // 轮询失败不打断，等待下一次
    })
  }, POLL_INTERVAL)
}

async function submit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  if (!rawFile.value) {
    ElMessage.warning('Choose an image to upload first')
    return
  }

  stage.value = 'uploading'
  percent.value = 0
  processError.value = ''

  const fd = new FormData()
  fd.append('file', rawFile.value)
  fd.append('title', form.title.trim())
  fd.append('description', form.description.trim())
  if (form.category_id) fd.append('category_id', String(form.category_id))
  fd.append('tags', parseTags(form.tags, UPLOAD_MAX_TAGS).join(','))

  try {
    const res = await createUpload(fd, (p) => {
      // 上传占进度条的前 90%，剩下 10% 留给服务端处理
      percent.value = Math.min(90, Math.round(p * 0.9))
    })
    uploadId.value = res.id
    stage.value = 'processing'
    percent.value = 92
    processStatus.value = res.process_status
    startPoll()
  } catch (error) {
    stage.value = 'failed'
    processError.value = error.friendlyMessage || 'Upload failed. Try again.'
  }
}

function reset() {
  stopPoll()
  stage.value = 'idle'
  percent.value = 0
  processStatus.value = ''
  processError.value = ''
  uploadId.value = null
  rawFile.value = null
  fileInfo.value = null
  if (previewUrl.value) {
    URL.revokeObjectURL(previewUrl.value)
    previewUrl.value = ''
  }
}

function goUploads() {
  router.push({ name: 'my-uploads' })
}

onMounted(async () => {
  try {
    // with_count=false：上传要能选到还没有图片的新分类
    categories.value = await getCategories(false)
  } catch {
    // 分类拉取失败时仍可上传，只是选不了分类
  }
})

onBeforeUnmount(() => {
  stopPoll()
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
})
</script>

<style lang="scss" scoped>
.back {
  font-size: 12px;
  color: $color-text-secondary;

  &:hover {
    color: $color-primary;
  }
}

// 玻璃质感统一走全局 .u-panel，这页只补自己的内边距与内部控件色
.u-panel {
  padding: 24px;

  // 玻璃面板上再叠一层实底输入框会显脏，输入区用浅灰填充保持微透
  :deep(.el-input__wrapper),
  :deep(.el-textarea__inner) {
    background: rgba(245, 245, 247, 0.9);
  }
}

.picker {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 40px 16px;
}

.picker--filled {
  padding: 0;
  position: relative;
}

.picker__img {
  max-height: 280px;
  width: auto;
  margin-inline: auto;
  border-radius: $radius-base;
}

.picker__mask {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(9, 10, 12, 0.6);
  color: #fff;
  font-size: 13px;
  border-radius: $radius-base;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.picker--filled:hover .picker__mask {
  opacity: 1;
}

.picker__title {
  font-size: 14px;
  font-weight: 600;
  color: $color-text;
}

.picker__desc {
  font-size: 12px;
  color: $color-text-muted;
}

.fileinfo {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 10px;
  padding: 8px 12px;
  background: $color-bg-page;
  border-radius: $radius-base;
  font-size: 12px;
}

.fileinfo__name {
  color: $color-text;

  @include ellipsis;
}

.fileinfo__size {
  flex: none;
  color: $color-text-muted;
}

.progress {
  margin-top: 20px;
  padding: 14px 16px;
  background: $color-bg-page;
  border-radius: $radius-base;
}

.progress__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.progress__label {
  font-size: 12px;
  color: $color-text-secondary;
}

.progress__error {
  margin-top: 8px;
  font-size: 12px;
  color: $color-danger;
}

.actions {
  display: flex;
  gap: 10px;
  margin-top: 22px;
  padding-top: 18px;
  border-top: 1px solid $color-border;
}

:deep(.el-upload-dragger) {
  padding: 0;
  border-radius: $radius-base;
}
</style>