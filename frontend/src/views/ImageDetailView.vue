<template>
  <div class="u-page">
    <div class="page-container">
      <div v-if="loading" class="dt dt--loading">
        <div class="dt__skeleton-img skeleton" />
        <div class="dt__skeleton-line skeleton" />
        <div class="dt__skeleton-line dt__skeleton-line--short skeleton" />
      </div>

      <EmptyState
        v-else-if="!detail"
        title="This frame is no longer available"
        description="It may have been removed by the creator, or it has not been approved yet"
      >
        <el-button type="primary" @click="router.push('/')">Back to discover</el-button>
      </EmptyState>

      <article v-else class="dt">
        <!-- 工具条：左侧返回与作者，右侧尺寸/下载/收藏。
             动作提到图片上方，图片本身就不再被任何面板包裹 -->
        <header class="dt__top">
          <button type="button" class="dt__back" @click="goBack">
            <span aria-hidden="true">←</span>
            Back
          </button>

          <router-link
            :to="{ name: 'user', params: { username: detail.owner.username } }"
            class="dt__owner"
          >
            <el-avatar :size="30" :src="detail.owner.avatar_url || ''">
              {{ (detail.owner.nickname || detail.owner.username).slice(0, 1).toUpperCase() }}
            </el-avatar>
            <span class="dt__owner-name">
              {{ detail.owner.nickname || detail.owner.username }}
            </span>
          </router-link>

          <div class="dt__actions">
            <RubberSegment
              v-model="variant"
              class="dt__sizes"
              size="sm"
              :items="sizeItems"
              track-color="rgba(255, 255, 255, 0.07)"
              thumb-color="#2b2f36"
              text-color="rgba(245, 245, 247, 0.6)"
              active-text-color="#f5f5f7"
              aria-label="Download size"
            />
            <el-button
              type="primary"
              class="dt__download"
              :loading="downloading"
              @click="onDownload"
            >
              Download free
            </el-button>
            <el-button
              class="dt__fav"
              :type="detail.is_favorited ? 'primary' : 'default'"
              plain
              :loading="favBusy"
              @click="onFavorite"
            >
              {{ detail.is_favorited ? 'Saved' : 'Save' }} {{ detail.favorites_count }}
            </el-button>
          </div>
        </header>

        <!-- 宽屏下左边是照片、右边是信息：单列时竖图两侧全是空黑，
             整页像「一张图孤零零挂幕布上」；两栏之后照片有了落脚点 -->
        <div class="dt__body">
          <div class="dt__media">
            <!-- 图片：裸露居中，不加白色卡片，只给圆角、极淡描边与投影 -->
            <div class="dt__stage" :style="frameVars">
              <el-image
                class="dt__img"
                :src="heroUrl"
                :preview-src-list="[heroUrl]"
                :initial-index="0"
                fit="contain"
                hide-on-click-modal
                preview-teleported
              />
            </div>

            <div v-if="isUnpublished" class="dt__notice">
              <StatusTag :status="detail.audit_status" />
              <StatusTag v-if="detail.process_status" :status="detail.process_status" kind="process" />
              <span v-if="detail.reject_reason" class="dt__notice-text">
                Rejected: {{ detail.reject_reason }}
              </span>
              <span v-else class="dt__notice-text">This frame is not public yet. Only the creator and admins can see it.</span>
            </div>
          </div>

          <aside class="dt__info">
            <!-- 作者条：头像 + 昵称 + 用户名 + 关注 -->
            <div class="dt__byline">
              <router-link
                :to="{ name: 'user', params: { username: detail.owner.username } }"
                class="dt__byline-owner"
              >
                <el-avatar :size="42" :src="detail.owner.avatar_url || ''">
                  {{ (detail.owner.nickname || detail.owner.username).slice(0, 1).toUpperCase() }}
                </el-avatar>
                <span class="dt__byline-text">
                  <b>{{ detail.owner.nickname || detail.owner.username }}</b>
                  <em>@{{ detail.owner.username }}</em>
                </span>
              </router-link>

              <div class="dt__byline-actions">
                <!-- 自己的作品不显示关注按钮 -->
                <FollowButton
                  v-if="detail.owner.id !== auth.userId"
                  size="small"
                  :username="detail.owner.username"
                  :is-following="detail.owner.is_following"
                  @update:is-following="onFollowChange"
                />
                <router-link
                  :to="{ name: 'user', params: { username: detail.owner.username } }"
                  class="dt__byline-more"
                >
                  View profile
                </router-link>
              </div>
            </div>

            <h1 class="dt__title">{{ detail.title }}</h1>

            <!-- 元信息：宽屏下改成两列网格，窄屏自动回落成一行一个 -->
            <dl class="dt__meta">
              <div v-for="row in metaRows" :key="row.label" class="dt__meta-item">
                <dt>{{ row.label }}</dt>
                <dd>
                  <i v-if="row.swatch" class="dt__swatch" :style="{ background: row.swatch }" />
                  <router-link v-if="row.to" class="link" :to="row.to">{{ row.value }}</router-link>
                  <template v-else>{{ row.value }}</template>
                </dd>
              </div>
            </dl>

            <p v-if="detail.description" class="dt__desc">{{ detail.description }}</p>

            <!-- 标签 -->
            <div v-if="detail.tags?.length" class="dt__tags">
              <router-link
                v-for="t in detail.tags"
                :key="t"
                :to="{ name: 'search', query: { tags: t } }"
                class="tag"
              >
                {{ t }}
              </router-link>
            </div>
          </aside>
        </div>
      </article>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import EmptyState from '@/components/common/EmptyState.vue'
import RubberSegment from '@/components/common/RubberSegment.vue'
import StatusTag from '@/components/common/StatusTag.vue'
import FollowButton from '@/components/social/FollowButton.vue'
import { favoriteImage, getImage, unfavoriteImage } from '@/api/modules/images'
import { useAuthStore } from '@/stores/auth'
import { useDownload } from '@/composables/useDownload'
import { VARIANT_LABELS } from '@/utils/constants'
import { formatDateTime, formatFileSize } from '@/utils/format'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const detail = ref(null)
const loading = ref(true)
const variant = ref('original')
const favBusy = ref(false)

const { busy: downloading, download } = useDownload()

const imageId = computed(() => route.params.id)

const isUnpublished = computed(() => {
  const d = detail.value
  if (!d) return false
  // 后端只把审核字段发给作者本人和管理员，普通访客拿到的是 null。
  // 那种情况下能打开详情页就说明图是公开的，不能拿 null 去比 approved，否则每张公开图都会误报。
  if (!d.audit_status) return false
  return d.audit_status !== 'approved' || d.is_deleted
})

// 优先 medium（1600w）做展示，够清晰又不必加载原图
const heroUrl = computed(() => {
  const list = detail.value?.variants || []
  const medium = list.find((v) => v.size_code === 'medium')
  return medium?.url || detail.value?.preview_url || detail.value?.thumb_url || ''
})

// 图片要「既铺满可行宽度、又不超过一屏」，两者互斥时取小的那个，
// 所以先把宽高比作为 --ar 交给 CSS，由 CSS 算 min(可用宽度, 可看高度 × 比例)。
// 竖图于是一屏内整体缩窄，而不是被裁掉、也不用手滚才能看全。
const frameVars = computed(() => {
  const { width, height } = detail.value || {}
  if (!width || !height) return {}
  return { '--ar': width / height }
})

// 工具条里的尺寸切换：只放名称，完整尺寸/体积在下面的元信息里能看到
const sizeItems = computed(() =>
  (detail.value?.variants || []).map((v) => ({
    value: v.size_code,
    label: VARIANT_LABELS[v.size_code] || v.size_code,
  })),
)

// 宽高比：直接约分常常约不出结果（1279×1706 互质，会显示成 1279:1706 这种噪音），
// 所以改成一个「拆成小整数比」的近似：在 12 以内找误差最小的分母，
// 误差过大（超过 2%）才退回小数比。常见相机比例因此能显示成 3:4 / 4:3 / 16:9
const aspectLabel = computed(() => {
  const w = detail.value?.width
  const h = detail.value?.height
  if (!w || !h) return ''
  const target = w / h
  let best = null
  for (let d = 1; d <= 12; d += 1) {
    const n = Math.round(target * d)
    if (n < 1) continue
    const err = Math.abs(target - n / d)
    if (!best || err < best.err) best = { n, d, err }
  }
  if (best && best.err <= 0.02) return `${best.n}:${best.d}`
  return `${target.toFixed(2)} : 1`
})

const EXIF_LABELS = {
  camera: 'Camera',
  lens: 'Lens',
  iso: 'ISO',
  aperture: 'Aperture',
  shutter: 'Shutter',
  focal_length: 'Focal length',
  focal_length_35mm: '35mm equivalent',
  software: 'Software',
  taken_at: 'Captured',
}

// 横向元信息。数值类放到同一个列表里，排版才整齐（对齐参考站的列式信息栏）
const metaRows = computed(() => {
  const d = detail.value
  if (!d) return []
  const rows = [
    { label: 'Dimensions', value: `${d.width} × ${d.height}` },
    { label: 'Aspect ratio', value: aspectLabel.value },
    { label: 'Format', value: (d.format || '').toUpperCase() },
    { label: 'File size', value: formatFileSize(d.file_size) },
  ]
  if (d.dominant_color) {
    rows.push({ label: 'Color', value: d.dominant_color.toUpperCase(), swatch: d.dominant_color })
  }
  if (d.category) {
    rows.push({
      label: 'Category',
      value: d.category.name,
      to: { name: 'category', params: { slug: d.category.slug } },
    })
  }
  rows.push(
    { label: 'Uploaded', value: formatDateTime(d.published_at || d.created_at) },
    { label: 'Views', value: `${d.views_count}` },
    { label: 'Downloads', value: `${d.downloads_count}` },
    { label: 'Saves', value: `${d.favorites_count}` },
  )
  const exif = d.exif
  if (exif && typeof exif === 'object') {
    for (const [key, label] of Object.entries(EXIF_LABELS)) {
      const value = exif[key]
      if (value === null || value === undefined || value === '') continue
      rows.push({ label, value: String(value) })
    }
  }
  return rows.filter((r) => r.value)
})

async function load() {
  loading.value = true
  detail.value = null
  try {
    detail.value = await getImage(imageId.value)
    // 默认选原图；后端没给原图（异常数据）时退到第一个可用档位
    const codes = (detail.value.variants || []).map((v) => v.size_code)
    variant.value = codes.includes('original') ? 'original' : codes[0] || 'original'
  } catch {
    detail.value = null
  } finally {
    loading.value = false
  }
}

watch(imageId, load)
onMounted(load)

// 直接进来的（比如分享链接）没有上一页可回，退到首页而不是把用户甩出站外
function goBack() {
  if (window.history.length > 1) router.back()
  else router.push('/')
}

function onFollowChange(value) {
  if (detail.value?.owner) detail.value.owner.is_following = value
}

async function onDownload() {
  const res = await download(detail.value.id, variant.value)
  if (res && detail.value) {
    detail.value.downloads_count += 1
  }
}

async function onFavorite() {
  if (!auth.isLoggedIn) {
    ElMessage.warning('Sign in to save this frame')
    router.push({ name: 'login', query: { redirect: route.fullPath } })
    return
  }
  favBusy.value = true
  try {
    const res = detail.value.is_favorited
      ? await unfavoriteImage(detail.value.id)
      : await favoriteImage(detail.value.id)
    detail.value.is_favorited = !!res.is_favorited
    detail.value.favorites_count = res.favorites_count
  } catch {
    // http 层已提示
  } finally {
    favBusy.value = false
  }
}
</script>

<style lang="scss" scoped>
// 照片在上、信息在下：照片独占一行，信息块整幅铺在它下面。
// 照片直接悬在近黑底上（没有白色卡片、没有边框）
.dt {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 1120px;
  margin-inline: auto;
}

.dt__body {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: clamp(20px, 2.2vw, 30px);
}

.dt__media {
  min-width: 0;
}

// 信息栏是一块很淡的玻璃面，落在照片下方：
// 文字和分隔线直接压在渐变底上会飘，有了这块面才读得出「一组信息」
.dt__info {
  min-width: 0;
  padding: 24px clamp(20px, 2.6vw, 34px) 22px;
  border-radius: $radius-card;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.065) 0%, rgba(255, 255, 255, 0.028) 100%);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.07),
    0 24px 60px -34px rgba(0, 0, 0, 0.9);
  backdrop-filter: blur(18px);
}

// 深色沉浸：页面是近黑冷底（$color-ink），页内 Element 控件
// （默认 / 朴素按钮、头像、下拉）都得跟着换色，否则浅色控件会像贴上去的白块。
// 变量只挂在本页根节点上，不外泄到其他页面。
.u-page {
  // 纯黑的整页会把照片和文字一起吞掉，读起来像「加载失败」。
  // 底改成带冷调的深灰蓝，顶部再铺两层很淡的顶光：
  // 一层照亮内容，一层落在照片背后，照片才有落脚的位置
  background:
    radial-gradient(72% 46% at 32% 8%, rgba(122, 150, 190, 0.16) 0%, rgba(122, 150, 190, 0) 68%),
    radial-gradient(120% 60% at 50% 0%, #232730 0%, rgba(35, 39, 48, 0) 66%),
    linear-gradient(180deg, #16181e 0%, #101216 62%, #0c0d11 100%);

  --el-text-color-primary: #f5f5f7;
  --el-text-color-regular: rgba(245, 245, 247, 0.88);
  --el-text-color-secondary: rgba(245, 245, 247, 0.62);
  --el-text-color-placeholder: rgba(245, 245, 247, 0.4);
  --el-border-color: rgba(255, 255, 255, 0.16);
  --el-border-color-light: rgba(255, 255, 255, 0.12);
  --el-border-color-lighter: rgba(255, 255, 255, 0.08);
  --el-border-color-hover: rgba(41, 151, 255, 0.5);
  --el-fill-color: rgba(255, 255, 255, 0.12);
  --el-fill-color-light: rgba(255, 255, 255, 0.06);
  --el-fill-color-blank: rgba(255, 255, 255, 0.08);
  --el-bg-color: rgba(255, 255, 255, 0.08);
  --el-bg-color-overlay: #1d1d1f;
  --el-bg-color-page: #{$color-ink};
  --el-avatar-bg-color: rgba(41, 151, 255, 0.2);
  --el-avatar-text-color: #f5f5f7;

  // 朴素主色按钮（收藏 / 关注）：蓝色半透明底 + 提亮的蓝字，
  // 落在纯黑底上既不扎眼也还是同一个主色
  :deep(.el-button--primary.is-plain) {
    --el-button-text-color: #2997ff;
    --el-button-bg-color: rgba(41, 151, 255, 0.16);
    --el-button-border-color: rgba(41, 151, 255, 0.4);
    --el-button-hover-text-color: #ffffff;
    --el-button-hover-bg-color: #0071e3;
    --el-button-hover-border-color: #0071e3;
  }

  // 「已关注」按钮自带浅色主题覆盖，深色底上要重写一遍（特异性抬到 0,3,0 才压得住）
  :deep(.follow-btn--on) {
    --el-button-text-color: rgba(245, 245, 247, 0.72);
    --el-button-border-color: rgba(255, 255, 255, 0.16);
    --el-button-hover-text-color: #{$color-danger};
    --el-button-hover-border-color: #{$color-danger};
  }
}

// ---- 工具条 ----
.dt__top {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 18px;

  @include respond($bp-md) {
    flex-wrap: wrap;
  }
}

.dt__back {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 14px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.14);
  font-size: 13px;
  color: rgba(245, 245, 247, 0.72);
  cursor: pointer;
  transition: color 0.18s ease, border-color 0.18s ease, background 0.18s ease;

  &:hover {
    color: #fff;
    border-color: rgba(255, 255, 255, 0.3);
    background: rgba(255, 255, 255, 0.12);
  }
}

.dt__owner {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.dt__owner-name {
  font-size: 14px;
  font-weight: 600;
  color: #f5f5f7;

  @include ellipsis;
}

.dt__actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-left: auto;

  @include respond($bp-md) {
    width: 100%;
    margin-left: 0;
  }
}

// 分段控件本身要有个确定宽度（它按槽位算拇指位置），窄屏就整行铺开
.dt__sizes {
  width: 232px;
  flex: none;

  @include respond($bp-md) {
    width: 100%;
  }
}

.dt__download,
.dt__fav {
  flex: none;
}

// ---- 图片 ----
// 只做居中容器，图片自己决定尺寸；不设底色、不设边框，
// 露出的是图片自己的圆角和投影，近黑底从四周把照片托起来
.dt__stage {
  position: relative;
  display: flex;
  justify-content: center;
  // 照片四周留一点空，投影才有落下去的地方
  padding-block: clamp(6px, 1.8vh, 22px);

  // 照片背后一圈极淡的光，黑底上照片就不会像贴纸浮在空中
  &::before {
    content: '';
    position: absolute;
    inset: 6% 10% 0;
    border-radius: 50%;
    background: radial-gradient(closest-side, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0) 100%);
    pointer-events: none;
  }
}

.dt__img {
  display: block;
  // 一屏内可见的高度上限，换算成对应宽度上限后与可用宽度取小，
  // 保证竖图不被裁、也不用滚动就能看全
  width: min(100%, calc(var(--cap-h) * var(--ar, 1)));
  border-radius: $radius-card;
  // 近黑底上要一圈极淡的描边，照片边界才不糊进背景里
  border: 1px solid rgba(255, 255, 255, 0.07);
  box-shadow: 0 26px 70px -28px rgba(0, 0, 0, 0.85);
  // 圆角要裁掉图片四角，overflow 必须留着
  overflow: hidden;
  // 一屏内可见的高度上限：扣掉导航栏、工具条和上下留白。
  // 留出的余量比两栏时多一点，图片下方那块信息栏能在首屏露出来
  --cap-h: calc(100vh - 250px);

  // element 给内层 img 写死了 height: 100%，落在高度 auto 的父级上会退化成
  // 按原始比例撑高，再被根元素裁掉，所以这里改回 auto；
  // 顺带 block 化，去掉行内元素底下那几像素基线缝隙
  :deep(.el-image__inner) {
    display: block;
    width: 100%;
    height: auto;
  }
}

.dt__notice {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  align-self: center;
  margin-top: 14px;
  padding: 8px 14px;
  border-radius: $radius-base;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.14);
  font-size: 12px;
  color: rgba(245, 245, 247, 0.68);
}

// ---- 作者条 ----
// 已经在信息面板内部，不再需要「上边框分隔」——
// 面板本身就把这块内容框住了，再画一条横线会像另起一段
.dt__byline {
  display: flex;
  align-items: center;
  gap: 14px;
}

.dt__byline-owner {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.dt__byline-text {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;

  b {
    font-size: 15px;
    font-weight: 600;
    color: #f5f5f7;

    @include ellipsis;
  }

  em {
    font-size: 12px;
    font-style: normal;
    color: rgba(245, 245, 247, 0.52);

    @include ellipsis;
  }
}

.dt__byline-actions {
  flex: none;
  display: flex;
  align-items: center;
  gap: 12px;
  margin-left: auto;
}

.dt__byline-more {
  font-size: 12px;
  color: rgba(245, 245, 247, 0.5);

  &:hover {
    color: $color-accent;
  }
}

// ---- 标题与元信息 ----
.dt__title {
  margin-top: 20px;
  font-size: 22px;
  font-weight: 700;
  line-height: 1.4;
  letter-spacing: -0.2px;
  color: #f5f5f7;
}

// 元信息铺满信息栏宽度：宽屏五列、中屏三列、窄屏两列，
// 十项信息正好排成整齐的两行，不再靠竖线硬分隔
.dt__meta {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  column-gap: 22px;
  row-gap: 16px;
  margin: 16px 0 0;
  padding: 16px 0;
  border-block: 1px solid rgba(255, 255, 255, 0.1);

  @include respond($bp-lg) {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  @include respond($bp-sm) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.dt__meta-item {
  display: flex;
  flex-direction: column;
  gap: 4px;

  dt {
    font-size: 12px;
    color: rgba(245, 245, 247, 0.52);
  }

  dd {
    display: flex;
    align-items: center;
    margin: 0;
    font-size: 14px;
    font-weight: 500;
    color: #f5f5f7;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
}

.dt__swatch {
  display: inline-block;
  width: 13px;
  height: 13px;
  margin-right: 6px;
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.26);
}

.dt__desc {
  margin-top: 16px;
  max-width: 900px;
  font-size: 14px;
  line-height: 1.75;
  color: rgba(245, 245, 247, 0.68);
  white-space: pre-wrap;
}

.dt__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 16px;
}

.link {
  color: $color-accent;
}

.tag {
  padding: 3px 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.07);
  border: 1px solid rgba(255, 255, 255, 0.14);
  font-size: 12px;
  color: rgba(245, 245, 247, 0.7);

  &:hover {
    border-color: rgba(41, 151, 255, 0.6);
    color: $color-accent;
    background: rgba(41, 151, 255, 0.16);
  }
}

// ---- 骨架屏 ----
.dt--loading {
  align-items: center;
  gap: 18px;
}

.skeleton {
  background: rgba(255, 255, 255, 0.08);
}

.dt__skeleton-img {
  width: min(100%, 520px);
  height: 60vh;
  border-radius: $radius-card;
}

.dt__skeleton-line {
  width: min(100%, 720px);
  height: 16px;
  border-radius: 6px;
}

.dt__skeleton-line--short {
  width: min(100%, 380px);
}
</style>
