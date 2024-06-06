// register vue composition api globally
import { createApp } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import App from './App.vue'

import '@unocss/reset/tailwind.css'
import './styles/main.css'
import 'uno.css'

import './utiles/uniJs.js'

import Index from '~/pages/index.vue'
import Overview from '~/pages/overview.vue'
import Components from '~/pages/components.vue'
import RouterPage from '~/pages/pages.vue'

const routes = [
  { path: '/', component: Index },
  { path: '/overview', component: Overview },
  { path: '/components', component: Components },
  { path: '/router', component: RouterPage },
]

const app = createApp(App)
const router = createRouter({
  history: createMemoryHistory(),
  routes,
})
app.use(router)
app.mount('#app')
