import { createApp } from 'vue'
import { applyPanelBranding } from '@design/panel-theme'
import App from './App.vue'
import './state/color-mode'
import 'virtual:uno.css'
import './styles.css'

/**
 * 从连接元信息里读 Hub 的 branding 主色并就地重写 `--devframe-primary`
 * （主题规范 §6.2 的重配色机制）。standalone 直连拿不到 branding 时静默
 * 保持默认鼠尾草绿。
 */
applyPanelBranding()

createApp(App).mount('#app')
