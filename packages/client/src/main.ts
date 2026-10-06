import { vTooltip } from 'floating-vue'
import { createApp, h } from 'vue'
import App from './App.vue'
import { isMockPanelUrl } from '@uni-helper/devtools-shared/utils/mock-flag'
import { router } from './router'
// 自托管字体（替代官方的 Google Fonts CDN）：离线/内网可用，观感不变。
import '@fontsource/dm-sans/400.css'
import '@fontsource/dm-sans/500.css'
import '@fontsource/dm-sans/600.css'
import '@fontsource/dm-sans/700.css'
import '@fontsource/dm-sans/800.css'
import '@fontsource/dm-mono/400.css'
import '@fontsource/dm-mono/500.css'
import 'floating-vue/dist/style.css'
import 'vue-virtual-scroller/index.css'
import 'uno.css'
import './style.css'

createApp({
  render: () => h(App),
  devtools: {
    hide: true,
  },
})
  .directive('tooltip', vTooltip)
  .use(router)
  .mount('#app')

// mock 模式常驻角标（URL 带 ?mock = fixtures 假数据，绝不能被误当真数据）。
if (isMockPanelUrl()) {
  const badge = document.createElement('div')
  badge.textContent = 'MOCK'
  badge.title = 'URL 带 ?mock：当前展示的是 fixtures 假数据，与真实小程序无关'
  badge.setAttribute('style', [
    'position:fixed', 'z-index:2147483647', 'right:10px', 'bottom:10px',
    'padding:2px 8px', 'border-radius:4px', 'font:600 10px ui-monospace,monospace',
    'background:#b45309', 'color:#fff', 'opacity:.9', 'pointer-events:none',
  ].join(';'))
  document.body.appendChild(badge)
}
