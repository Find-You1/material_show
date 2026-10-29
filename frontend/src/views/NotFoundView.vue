<template>
  <div class="nf page-container">
    <div class="nf__code">404</div>
    <p class="nf__title">Page not found</p>
    <p class="nf__desc">This link may have expired, or the content was removed by its author</p>
    <div class="nf__actions">
      <el-button type="primary" @click="router.push('/')">Back to home</el-button>
      <el-button @click="router.back()">Go back</el-button>
    </div>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router'

const router = useRouter()
</script>

<style lang="scss" scoped>
.nf {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding-block: 96px;
  text-align: center;
}

.nf__code {
  font-size: 64px;
  font-weight: 700;
  line-height: 1;
  letter-spacing: -2px;
  color: $color-border-strong;
}

.nf__title {
  margin-top: 16px;
  font-size: 18px;
  font-weight: 600;
  color: $color-text;
}

.nf__desc {
  margin-top: 6px;
  font-size: 13px;
  color: $color-text-secondary;
}

.nf__actions {
  display: flex;
  gap: 10px;
  margin-top: 22px;
}
</style>