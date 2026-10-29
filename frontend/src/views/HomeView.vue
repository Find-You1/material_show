<template>
  <div class="home">
    <!--
      电影感开场：一条黄昏山路，跑车一路向前，两侧的画框顺着弯道铺开。
      点任意画框 → CinemaOverlay 放映；滚动进度写进 --p，由 CSS 让文案退场。
    -->
    <section class="cine" :class="{ 'cine--ready': heroReady }" :style="heroStyle">
      <RoadScene
        ref="roadRef"
        class="cine__scene"
        :items="shots"
        @select="openFrame"
        @ready="markHeroReady"
        @theme="onThemeChange"
      />

      <div class="cine__copy">
        <p class="cine__eyebrow">Lumen Originals</p>
        <h1 class="cine__title">Every frame<br />tells a story.</h1>
        <p class="cine__sub">
          A curated archive of high-resolution imagery, free to download and ready for
          your next film, poster or campaign.
        </p>
        <div class="cine__actions">
          <router-link to="/search?order=popular" class="cine__btn">Explore the collection</router-link>
          <router-link to="/upload" class="cine__btn cine__btn--glass">Submit your work</router-link>
        </div>
      </div>

      <!-- 雪地/沙滩这类亮地面会把白字吃掉；只在亮主题叠一层左侧压暗 -->
      <div class="cine__scrim" :class="{ 'cine__scrim--on': brightScrim }" aria-hidden="true"></div>

      <!-- 场景切换 + 右侧操作提示。
           切换换的是整套配色（路面、天空、树、车漆），不是换模型；
           提示条回到标签右边，一直摆着告诉用户画面可以拖、可以按空格 -->
      <div class="cine__bar">
        <div class="cine__themes" role="group" aria-label="Scene">
          <button
            v-for="(theme, index) in themes"
            :key="theme.id"
            type="button"
            class="scene-theme"
            :class="{ 'scene-theme--on': themeIndex === index }"
            :aria-pressed="themeIndex === index"
            @click="pickTheme(index)"
          >
            {{ theme.label }}
          </button>
        </div>
        <p class="cine__cue">Drag to look around · Space to pause</p>
      </div>
    </section>

    <CinemaOverlay
      v-if="selectedFrame"
      :frame="selectedFrame.item"
      :origin="selectedFrame.rect"
      @close="closeFrame"
    />

    <!-- 深色精选段：三张竖幅剧照，编号 + 标题，像片尾字幕表 -->
    <section v-if="featuredShots.length" class="feature">
      <div class="page-container">
        <header class="feature__head">
          <div>
            <p class="feature__eyebrow">Featured</p>
            <h2 class="feature__title">Chosen this week.</h2>
          </div>
          <router-link to="/search?order=popular" class="feature__more">View all frames</router-link>
        </header>

        <div class="feature__grid" :class="`feature__grid--${featuredShots.length}`">
          <router-link
            v-for="(shot, index) in featuredShots"
            :key="shot.id"
            :to="{ name: 'photo', params: { id: shot.id } }"
            class="frame"
          >
            <span class="frame__media">
              <img :src="shot.image" :alt="shot.title || 'Featured frame'" loading="lazy" />
            </span>
            <span class="frame__meta">
              <span class="frame__index">0{{ index + 1 }}</span>
              <span class="frame__title">{{ shot.title || 'Untitled frame' }}</span>
            </span>
          </router-link>
        </div>
      </div>
    </section>

    <!-- 白色档案区：真正的浏览入口，保持 Apple 浅色可读性 -->
    <section class="archive">
      <div class="page-container">
        <div class="page-head">
          <div>
            <div class="page-head__title">The archive</div>
            <div class="page-head__desc">
              Browse every frame by category, tag or keyword. All downloads are free.
            </div>
          </div>

          <RubberSegment
            v-model="tab"
            class="feed-tabs"
            :items="feedTabs"
            aria-label="Feed type"
            @change="onTabChange"
          />
        </div>

        <div v-if="categories.length" class="cats u-mb-24">
          <router-link
            v-for="c in categories"
            :key="c.id"
            :to="{ name: 'category', params: { slug: c.slug } }"
            class="cat"
          >
            <span class="cat__name">{{ c.name }}</span>
            <span class="cat__count">{{ c.image_count }}</span>
          </router-link>
        </div>

        <ImageFeed
          v-model:order="order"
          :fetcher="listImages"
          :params="feedParams"
          :empty-title="emptyTitle"
          :empty-desc="emptyDesc"
        >
          <template #filters>
            <div class="feed-filter">
              <el-input
                v-model="tagKeyword"
                placeholder="Search by keyword, e.g. coastline"
                clearable
                @keyup.enter="goSearch"
              >
                <template #prefix>
                  <el-icon><Search /></el-icon>
                </template>
              </el-input>
            </div>
          </template>

          <template #empty-action>
            <el-button v-if="tab === 'following'" @click="tab = 'recommend'">Explore popular</el-button>
            <el-button v-else type="primary" @click="router.push('/upload')">Upload a frame</el-button>
          </template>
        </ImageFeed>
      </div>
    </section>

    <!-- 黑场收尾：把视线从列表拉回品牌，再交给页脚 -->
    <section class="cta">
      <div class="page-container cta__inner">
        <h2 class="cta__title">Your work belongs here.</h2>
        <p class="cta__sub">Share your frames with a community that cares about light, color and composition.</p>
        <router-link to="/upload" class="cine__btn">Start uploading</router-link>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Search } from '@element-plus/icons-vue'

import ImageFeed from '@/components/image/ImageFeed.vue'
import RubberSegment from '@/components/common/RubberSegment.vue'
import RoadScene from '@/components/home/RoadScene.vue'
import CinemaOverlay from '@/components/home/CinemaOverlay.vue'
import { listImages } from '@/api/modules/images'
import { getCategories } from '@/api/modules/taxonomy'
import { THEMES } from '@/three/road/config'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const categories = ref([])
const order = ref('latest')
const tagKeyword = ref('')

// 路边展出的剧照：最多 12 张，左右交错铺在山路两边
const shots = ref([])
// 精选段只取前三张，保持原来的三栏字幕表
const featuredShots = computed(() => shots.value.slice(0, 3))

// 点击画框后进入放映层
const selectedFrame = ref(null)
const roadRef = ref(null)

const heroStyle = ref({ '--p': 0 })

// 入场闸门：等山路场景画出第一帧再让文案升起来，否则动画会跑在空画面上
const heroReady = ref(false)

let raf = 0
let readyTimer = 0

function markHeroReady() {
  if (heroReady.value) return
  heroReady.value = true
  clearTimeout(readyTimer)
}

function openFrame(payload) {
  selectedFrame.value = payload
}

function closeFrame() {
  selectedFrame.value = null
  // 放映层收回去的同时，相机从画框前退回车上
  roadRef.value?.resetView()
}

// 场景主题：山路 / 雪地 / 森林 / 黎明 / 暮色 / 深夜 / 海岸 / 沙漠。
// 切换是 0.9s 的整段颜色过渡，车漆一起变；没人操作时每 20s 自动轮播下一套
const themes = THEMES
const themeIndex = ref(0)
// 亮地面（雪 / 沙滩 / 沙漠）会把白色标题吃掉，这些主题要多一层左侧压暗
const BRIGHT_THEMES = ['snow', 'coast', 'desert']
const brightScrim = computed(() => BRIGHT_THEMES.includes(themes[themeIndex.value]?.id))

function pickTheme(index) {
  if (themeIndex.value === index) return
  themeIndex.value = index
  roadRef.value?.setTheme(index)
}

// 自动轮播时由场景把新主题报回来，高亮跟着走
function onThemeChange(index) {
  themeIndex.value = index
}

// 滚动进度 0..1：只负责读数，位移与透明度全部交给 CSS
function updateHero() {
  const total = Math.max(1, window.innerHeight)
  const p = Math.min(1, Math.max(0, window.scrollY / total))
  heroStyle.value = { '--p': p.toFixed(3) }
}

function onScroll() {
  cancelAnimationFrame(raf)
  raf = requestAnimationFrame(updateHero)
}

// 推荐 = 公共区全部；关注 = 只看已关注作者
const tab = ref('recommend')
const feedTabs = [
  { value: 'recommend', label: 'Recommended' },
  { value: 'following', label: 'Following' },
]

const feedParams = computed(() => (tab.value === 'following' ? { scope: 'following' } : {}))

const emptyTitle = computed(() =>
  tab.value === 'following' ? 'You are not following anyone yet' : 'No frames to show yet',
)

const emptyDesc = computed(() =>
  tab.value === 'following'
    ? 'Follow a few creators and their latest public frames will appear here.'
    : 'The public archive is empty right now. Upload a frame and it will land here once approved.',
)

function onTabChange(value) {
  if (value === 'following' && !auth.isLoggedIn) {
    ElMessage.info('Sign in to see the creators you follow')
    router.push({ name: 'login', query: { redirect: route.fullPath } })
    tab.value = 'recommend'
  }
}

function goSearch() {
  const q = tagKeyword.value.trim()
  if (!q) return
  router.push({ name: 'search', query: { q } })
}

onMounted(async () => {
  // 兜底：图片迟迟不回来（或接口失败）也要在 2.5 秒后揭开黑幕，别一直黑着
  readyTimer = window.setTimeout(markHeroReady, 2500)

  try {
    categories.value = await getCategories()
  } catch {
    // 分类拿不到不影响主流程
  }

  try {
    // 列表只给 thumb（400px）与 preview（960px）；山路画框用 preview 才够清晰
    const data = await listImages({ order: 'popular', size: 12 })
    shots.value = (data.items || []).map((item) => ({
      id: item.id,
      image: item.preview_url || item.thumb_url,
      title: item.title,
      owner: item.owner ? { username: item.owner.username } : null,
    }))
  } catch {
    // 拿不到就只剩空山路，下面的档案区照常
  }

  window.addEventListener('scroll', onScroll, { passive: true })
  updateHero()
})

onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  clearTimeout(readyTimer)
  window.removeEventListener('scroll', onScroll)
})
</script>

<style lang="scss" scoped>
// ========== 电影感开场：山路片场 ==========
.cine {
  position: relative;
  // 导航栏是 sticky 的，扣掉它才是真正的「满屏」
  min-height: calc(100svh - var(--navbar-height));
  overflow: hidden;
  background: $color-bg-cinema;
  color: $color-text-on-dark;
}

// 整条山路、跑车、路边画框都在这一层 canvas 里
.cine__scene {
  position: absolute;
  inset: 0;
  z-index: 0;
}

@keyframes rise-in {
  from {
    opacity: 0;
    transform: translateY(26px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@keyframes fade-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.cine__copy {
  position: relative;
  z-index: 2;
  // 文案块整体放大一号：标题更宽、副文案更宽，视觉重心向右下铺开一点，
  // 不再是一小撮字挤在左上角
  max-width: 730px;
  padding: clamp(34px, 6.5vh, 78px) 24px clamp(8px, 3vh, 32px) clamp(24px, 5vw, 72px);
  text-align: left;
  pointer-events: none;
  // 文案先退场，山路和跑车留在黑场里继续往前
  opacity: clamp(0, calc(1 - var(--p, 0) * 1.7), 1);
  transform: translateY(calc(var(--p, 0) * 44px)) scale(calc(1 - var(--p, 0) * 0.03));
  will-change: opacity, transform;
}

// 文案逐级错峰入场：小标题 → 大标题 → 副标题 → 按钮，像片头字幕一条条出来
.cine__eyebrow {
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.34em;
  text-transform: uppercase;
  color: rgba(245, 245, 247, 0.62);
  opacity: 0;
}

.cine--ready .cine__eyebrow {
  animation: rise-in 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.35s both;
}

.cine__title {
  margin-top: 18px;
  font-size: clamp(38px, 5.4vw, 82px);
  font-weight: 600;
  line-height: 0.98;
  letter-spacing: -0.045em;
  color: #fff;
  opacity: 0;

  @include respond($bp-md) {
    font-size: clamp(32px, 8.4vw, 50px);
  }
}

.cine--ready .cine__title {
  animation: rise-in 1s cubic-bezier(0.16, 1, 0.3, 1) 0.5s both;
}

.cine__sub {
  max-width: 560px;
  margin: 22px 0 0;
  font-size: 17px;
  line-height: 1.62;
  color: $color-text-on-dark-soft;
  opacity: 0;

  @include respond($bp-sm) {
    font-size: 14px;
  }
}

.cine--ready .cine__sub {
  animation: rise-in 0.9s cubic-bezier(0.16, 1, 0.3, 1) 0.78s both;
}

.cine__actions {
  display: flex;
  justify-content: flex-start;
  gap: 12px;
  margin-top: 26px;
  opacity: 0;
  // 文案层整体不挡 canvas，只有按钮恢复点击
  pointer-events: auto;

  @include respond($bp-sm) {
    flex-direction: column;
    align-items: flex-start;
  }
}

.cine--ready .cine__actions {
  animation: rise-in 0.9s cubic-bezier(0.16, 1, 0.3, 1) 0.95s both;
}

.cine__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 13px 30px;
  border-radius: 980px;
  font-size: 15px;
  font-weight: 500;
  // 首屏是黑白片场，主按钮也用白色，别让蓝点破画面
  color: #0a0a0a;
  background: #f5f5f7;
  transition: background 0.2s ease, transform 0.2s ease, border-color 0.2s ease;

  &:hover {
    color: #000;
    background: #ffffff;
    transform: translateY(-1px);
  }
}

// 玻璃胶囊：黑场上只靠一圈发丝白边交代边界
.cine__btn--glass {
  // 画框会从按钮后面经过，白底会把白字吃掉；用接近纯黑的实底，
  // 不用 backdrop-filter —— 它压在白色路面上会糊成一团亮斑
  color: $color-text-on-dark;
  background: rgba(9, 9, 11, 0.86);
  border: 1px solid rgba(255, 255, 255, 0.22);

  &:hover {
    color: #fff;
    background: rgba(9, 9, 11, 0.96);
    border-color: rgba(255, 255, 255, 0.42);
  }
}

// 雪地、海岸、沙漠这类亮地面的主题，标题需要左侧压暗才读得清
.cine__scrim {
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.6s ease;
  background: linear-gradient(
    104deg,
    rgba(6, 9, 13, 0.78) 0%,
    rgba(6, 9, 13, 0.46) 32%,
    rgba(6, 9, 13, 0) 62%
  );

  &--on {
    opacity: 1;
  }
}

// 底部一行：左边是场景分段控件，右边是操作提示。
// 整条栏不吃指针（画框会从后面经过），只有按钮恢复 auto
.cine__bar {
  position: absolute;
  bottom: 22px;
  left: clamp(24px, 5vw, 72px);
  right: clamp(24px, 5vw, 72px);
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  pointer-events: none;
  opacity: 0;
}

.cine--ready .cine__bar {
  animation: fade-in 1s ease 1.45s both;
}

// 场景切换：深色轨道里的分段控件。轨道不能省 —— 激活项是白色胶囊，
// 直接压在白路面上会整个消失，只剩一行字
.cine__themes {
  display: flex;
  gap: 2px;
  padding: 3px;
  border-radius: 980px;
  background: rgba(9, 9, 11, 0.78);
  border: 1px solid rgba(255, 255, 255, 0.12);
  min-width: 0;
  pointer-events: auto;
  // 八套主题在窄屏放不下：整条横滑，别把按钮挤成两行
  overflow-x: auto;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
}

// 操作提示：深色实底 + 发丝白边。压在白路面上不能用 backdrop-filter，
// 模糊会把路面糊成一团亮斑
.cine__cue {
  flex: none;
  margin: 0;
  padding: 7px 14px;
  border-radius: 980px;
  background: rgba(9, 9, 11, 0.78);
  border: 1px solid rgba(255, 255, 255, 0.12);
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  white-space: nowrap;
  color: rgba(245, 245, 247, 0.62);
}

.scene-theme {
  padding: 7px 14px;
  border: 0;
  border-radius: 980px;
  background: transparent;
  color: rgba(245, 245, 247, 0.6);
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  cursor: pointer;
  transition:
    background 0.25s ease,
    color 0.25s ease;

  &:hover {
    color: #fff;
    background: rgba(255, 255, 255, 0.08);
  }

  &--on {
    background: #f5f5f7;
    color: #1d1d1f;

    &:hover {
      background: #f5f5f7;
      color: #1d1d1f;
    }
  }
}

// ========== 深色精选段 ==========
.feature {
  padding: 88px 0 96px;
  background: $color-bg-cinema-soft;
  color: $color-text-on-dark;
}

.feature__head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 30px;
}

.feature__eyebrow {
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.3em;
  text-transform: uppercase;
  color: rgba(245, 245, 247, 0.5);
}

.feature__title {
  margin-top: 10px;
  font-size: clamp(28px, 3.4vw, 44px);
  font-weight: 600;
  letter-spacing: -0.035em;
  color: #fff;
}

.feature__more {
  font-size: 14px;
  color: #2997ff;
  white-space: nowrap;

  &:hover {
    color: #5cb3ff;
  }
}

.feature__grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px;

  &--1 {
    grid-template-columns: minmax(0, 460px);
  }

  &--2 {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @include respond($bp-md) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @include respond($bp-sm) {
    grid-template-columns: minmax(0, 1fr);
  }
}

.frame {
  display: block;
  color: inherit;
}

.frame__media {
  display: block;
  overflow: hidden;
  border-radius: 16px;
  background: #161618;
  aspect-ratio: 4 / 5;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: transform 0.8s cubic-bezier(0.25, 0.1, 0.25, 1), filter 0.5s ease;
    filter: brightness(0.92);
  }
}

.frame:hover .frame__media img {
  transform: scale(1.04);
  filter: brightness(1);
}

.frame__meta {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-top: 14px;
}

.frame__index {
  font-size: 11px;
  letter-spacing: 0.16em;
  color: rgba(245, 245, 247, 0.38);
  font-variant-numeric: tabular-nums;
}

.frame__title {
  font-size: 14px;
  color: $color-text-on-dark-soft;
  @include ellipsis;
}

// ========== 白色档案区 ==========
.archive {
  padding-block: 72px 24px;
  background: $color-bg-page;
}

.feed-tabs {
  flex: none;
}

.cats {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
}

.cat {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 12px 14px;
  background: $color-bg-card;
  border: 1px solid $color-border;
  border-radius: $radius-base;
  transition: border-color 0.25s ease, transform 0.25s ease, box-shadow 0.25s ease;

  &:hover {
    transform: translateY(-2px);
    border-color: transparent;
    box-shadow: $shadow-card;
  }
}

.cat__name {
  font-size: 13px;
  font-weight: 500;
  color: $color-text;
}

.cat__count {
  font-size: 12px;
  color: $color-text-muted;
  font-variant-numeric: tabular-nums;
}

.feed-filter {
  max-width: 280px;
}

// ========== 黑场收尾 ==========
.cta {
  padding: 96px 0 104px;
  background: $color-bg-cinema;
  color: $color-text-on-dark;
  text-align: center;
}

.cta__inner {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.cta__title {
  font-size: clamp(30px, 4.2vw, 52px);
  font-weight: 600;
  line-height: 1.08;
  letter-spacing: -0.04em;
  color: #fff;
}

.cta__sub {
  max-width: 520px;
  margin: 16px 0 30px;
  font-size: 16px;
  line-height: 1.6;
  color: $color-text-on-dark-soft;
}

// 提示条要跟标签抢横向空间：窄屏先撤提示，保住八个场景按钮
@media (max-width: 1080px) {
  .cine__cue {
    display: none;
  }
}

@media (max-width: 760px) {
  .cine__bar {
    left: 16px;
    right: 16px;
    bottom: 16px;
  }

  .scene-theme {
    padding: 6px 10px;
    font-size: 9px;
    letter-spacing: 0.1em;
  }
}

@media (prefers-reduced-motion: reduce) {
  .cine__eyebrow,
  .cine__title,
  .cine__sub,
  .cine__actions,
  .frame__media img {
    animation: none;
    transition: none;
  }

  // 关掉动效就直接给终态，别停在「字还没出来」
  .cine__eyebrow,
  .cine__title,
  .cine__sub,
  .cine__actions {
    opacity: 1;
    transform: none;
  }
}
</style>
