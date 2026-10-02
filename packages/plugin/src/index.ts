import process from 'node:process'
import type { Plugin } from 'vite'
import { createFilter } from 'vite'
import detectPort from 'detect-port'
import { createDevtoolServe } from './devtoolServer'
import { loadInspectPlugin } from './loadOtherPlugin/inspectPlugin'
import type { Options } from './types'
import type createRouter from './devtoolServer/rpc/index'
import { pluginByEnv } from './logic/pluginByEnv'
import { injectDevtoolInfo } from './injects/injectVueFile'
import { injectImportDevtools } from './injects/injectMainFile'
import { injectPageFile } from './injects/injectPageFile'
import { getPagesInfo } from './logic'
import { loadVisualizerPlugin } from './loadOtherPlugin/visualizerPlugin'

export * from './types'
export type AppRouter = ReturnType<typeof createRouter>
export default function UniDevToolsPlugin(options?: Partial<Options>): Plugin[] {
  const _plugin = pluginByEnv(options)
  if (_plugin) {
    return _plugin
  }
  const port = options?.port || 5015
  let actualPort = port
  process.env.UNI_DEVTOOLS_PORT = String(port)
  const inspect = loadInspectPlugin()
  const visualizer = loadVisualizerPlugin()
  const [_, pages] = getPagesInfo(options?.pageJsonPath)

  const plugin = <Plugin>{
    name: 'uni-devtools',
    enforce: 'pre',
    async config() {
      // 在 config 阶段同步检测可用端口
      actualPort = await detectPort(port)
      if (actualPort !== port) {
        console.warn(`[uni-devtools] Port ${port} is already in use, will use port ${actualPort}`)
      }
      process.env.UNI_DEVTOOLS_PORT = String(actualPort)

      return {
        define: {
          __UNI_DEVTOOLS_PORT__: JSON.stringify(actualPort),
        },
      }
    },
    configResolved(resolvedConfig) {
      createDevtoolServe({
        port: actualPort,
        resolvedConfig,
        options,
      })
    },
    transform(src, id) {
      const filterMainFile = createFilter(['src/main.(ts|js)', 'main.(ts|js)'])
      if (filterMainFile(id))
        return injectImportDevtools(src, id)

      const vueFilter = createFilter(['**/*.vue'])
      if (vueFilter(id)) {
        const pagesInclude = pages.map(page => `**/${page.path}.vue`)
        const filterPages = createFilter(pagesInclude)
        if (filterPages(id)) {
          src = injectPageFile(src, id).code
        }

        return injectDevtoolInfo(src, id)
      }
    },
  }
  return [plugin, inspect, visualizer]
}
