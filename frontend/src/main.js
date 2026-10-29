import { createApp } from 'vue'
import { createPinia } from 'pinia'

// 顺序有讲究：Element Plus 完整主题在前，我们的覆盖在后，最后是工具类。
// （主题覆盖用 :root:root 提升特异性，与顺序无关，见 element-overrides.scss）
import 'element-plus/dist/index.css'
import './styles/base.scss'
import './styles/element-overrides.scss'
import './styles/utilities.scss'

import App from './App.vue'
import router from './router'
import { tilt } from './directives/tilt'
import { useAuthStore } from './stores/auth'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)

// 全局指令：卡片 3D 倾斜 + 高光追踪
app.directive('tilt', tilt)

// 路由守卫依赖 auth store，必须在 pinia 装载之后注册
useAuthStore().restore()
app.use(router)

app.mount('#app')