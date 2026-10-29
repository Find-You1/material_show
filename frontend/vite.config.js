import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'

// 后端地址：本机 uvicorn（8000 被 city_app 占用，本地开发暂用 8003）
const BACKEND = 'http://127.0.0.1:8003'

export default defineConfig({
  plugins: [
    vue(),
    // Element Plus 按需引入组件与 API。
    // importStyle:false —— 样式不按组件逐个引入，而是由 main.js 一次性引入
    // element-plus/dist/index.css。原因是按需样式会产生大量
    // `element-plus/es/components/*/style/css` 子依赖，Vite 在开发期每发现一个
    // 就重新优化依赖并强制整页刷新，控制台刷满 net::ERR_ABORTED，体验很差。
    AutoImport({
      imports: ['vue', 'vue-router', 'pinia'],
      resolvers: [ElementPlusResolver({ importStyle: false })],
      dts: false,
    }),
    Components({
      resolvers: [ElementPlusResolver({ importStyle: false })],
      dts: false,
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  css: {
    preprocessorOptions: {
      scss: {
        // 设计令牌对所有 scss 文件可用（仅变量与 mixin，不产出 CSS）
        additionalData: `@use "@/styles/tokens.scss" as *;`,
      },
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      // 接口；ws:true 让开发期的 /api/ws 也能走 WebSocket 升级（否则只当普通 HTTP 代理）
      '/api': { target: BACKEND, changeOrigin: true, ws: true },
      // 图片静态资源：漏掉这条本地图会全部 404
      '/media': { target: BACKEND, changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // three.js 单独成 chunk：首页只在用户主动进入 3D 漫游时才动态 import，
          // 拆开后既保证首屏不加载它，又能在访客之间共享缓存
          if (id.includes('node_modules/three')) return 'three'
          return undefined
        },
      },
    },
  },
})