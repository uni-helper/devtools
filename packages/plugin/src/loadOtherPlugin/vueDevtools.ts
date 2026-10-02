import type { Plugin } from 'vite'
import type { VitePluginVueDevToolsOptions } from 'vite-plugin-vue-devtools'
import DevTools from 'vite-plugin-vue-devtools'

export function loadVueDevtoolsPlugin(options?: VitePluginVueDevToolsOptions) {
  return DevTools(options) as Plugin
}
