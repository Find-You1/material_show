<template>
  <div>
    <div class="page-head">
      <div>
        <div class="page-head__title">Overview</div>
        <div class="page-head__desc">A live view of content and the processing queue</div>
      </div>
      <el-button :loading="loading" @click="load">Refresh</el-button>
    </div>

    <div v-loading="loading" class="hero">
      <div class="hero__item">
        <StatNumber :value="stats.pending" label="Pending review" size="large" />
      </div>
      <div class="hero__item">
        <StatNumber :value="stats.approved" label="Published" size="large" />
      </div>
      <div class="hero__item">
        <StatNumber :value="stats.rejected" label="Rejected" size="large" />
      </div>
      <div class="hero__item">
        <StatNumber :value="stats.taken_down" label="Taken down" size="large" />
      </div>
    </div>

    <div class="grid u-mt-24">
      <div class="card">
        <div class="u-section-title u-mb-16">Image processing queue</div>
        <div class="grid-inner">
          <StatNumber :value="stats.queued" label="Queued" />
          <StatNumber :value="stats.processing" label="Processing" />
          <StatNumber :value="stats.ready" label="Ready" />
          <StatNumber :value="stats.failed" label="Failed" />
        </div>
        <router-link :to="{ name: 'admin-images' }" class="card__link">Go to images</router-link>
      </div>

      <div class="card">
        <div class="u-section-title u-mb-16">Shortcuts</div>
        <div class="entries">
          <router-link :to="{ name: 'admin-audit' }" class="entry">
            <span class="entry__title">Audit queue</span>
            <span class="entry__desc">
              <template v-if="stats.pending > 0">{{ stats.pending }} images awaiting review</template>
              <template v-else>The queue is clear. Nothing to review.</template>
            </span>
          </router-link>
          <router-link :to="{ name: 'admin-categories' }" class="entry">
            <span class="entry__title">Categories and tags</span>
            <span class="entry__desc">Manage how the public library is organized</span>
          </router-link>
          <router-link :to="{ name: 'admin-users' }" class="entry">
            <span class="entry__title">Users</span>
            <span class="entry__desc">Manage roles and account status</span>
          </router-link>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'

import StatNumber from '@/components/common/StatNumber.vue'
import { getAuditStats } from '@/api/modules/admin'

const loading = ref(true)

const stats = reactive({
  pending: 0,
  approved: 0,
  rejected: 0,
  taken_down: 0,
  queued: 0,
  processing: 0,
  failed: 0,
  ready: 0,
})

async function load() {
  loading.value = true
  try {
    Object.assign(stats, await getAuditStats())
  } catch {
    // http 层已提示
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<style lang="scss" scoped>
.hero {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 0;
  padding: 8px 0;
  background: $color-bg-card;
  border: 1px solid $color-border;
  border-radius: $radius-card;
  box-shadow: $shadow-card;
}

.hero__item {
  padding: 26px 28px;
  border-right: 1px solid $color-border;

  &:last-child {
    border-right: none;
  }

  @include respond($bp-md) {
    border-right: none;
    border-bottom: 1px solid $color-border;

    &:last-child {
      border-bottom: none;
    }
  }
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 16px;
}

.card {
  position: relative;
  padding: 20px 22px;
  background: $color-bg-card;
  border: 1px solid $color-border;
  border-radius: $radius-card;
  box-shadow: $shadow-card;
}

.grid-inner {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
  gap: 14px;
}

.card__link {
  display: inline-block;
  margin-top: 18px;
  font-size: 12px;
  font-weight: 600;
  color: $color-primary;
}

.entries {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.entry {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 12px;
  border: 1px solid $color-border;
  border-radius: $radius-base;
  transition: border-color 0.18s ease, background 0.18s ease;

  &:hover {
    border-color: $color-primary;
    background: $color-primary-soft;
  }
}

.entry__title {
  font-size: 13px;
  font-weight: 600;
  color: $color-text;
}

.entry__desc {
  font-size: 12px;
  color: $color-text-secondary;
}
</style>