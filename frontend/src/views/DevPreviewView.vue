<template>
  <div class="preview">
    <SettingsView v-if="mode === 'settings'" />
    <CinemaOverlay v-else-if="frame" :frame="frame" :origin="null" @close="frame = null" />
    <button v-else type="button" @click="open('landscape')">Landscape frame</button>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'

import CinemaOverlay from '@/components/home/CinemaOverlay.vue'
import SettingsView from '@/views/me/SettingsView.vue'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const auth = useAuthStore()
const mode = ref(String(route.query.mode || ''))
const frame = ref(null)

const IMAGES = {
  landscape: 'https://picsum.photos/seed/lumen-landscape/1600/900',
  portrait: 'https://picsum.photos/seed/lumen-portrait/900/1600',
}

onMounted(() => {
  if (mode.value === 'settings') {
    auth.setUser({
      id: 1,
      username: 'admin',
      email: 'admin@material-show.local',
      role: 'admin',
      nickname: '管理员',
      created_at: '2026-10-01T00:00:00Z',
      avatar_url: '',
    })
    return
  }
  const kind = route.query.kind === 'portrait' ? 'portrait' : 'landscape'
  setTimeout(() => open(kind), 200)
})

function open(kind) {
  frame.value = {
    id: 1,
    title: kind === 'portrait' ? 'Portrait frame' : '大椰子树',
    owner: { username: 'lzxiang814' },
    image: IMAGES[kind],
  }
}
</script>

<style lang="scss" scoped>
.preview {
  display: block;
  padding: 0;
}
</style>
