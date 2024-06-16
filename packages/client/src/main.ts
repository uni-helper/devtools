import { createApp } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router/auto'
import App from './App.vue'

import '@unocss/reset/tailwind.css'
import './styles/main.css'
import 'uno.css'
/** uni JS-SDK */
import './utils/uniJs.js'

const app = createApp(App)
const router = createRouter({
  history: createMemoryHistory(),
})
app.use(router)
app.mount('#app')
