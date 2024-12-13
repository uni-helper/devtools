import process from 'node:process'
import type { Plugin } from 'vite'
import { createFilter } from 'vite'
import { createDevtoolServe } from './devtoolServer'
import { loadInspectPlugin } from './loadOtherPlugin/inspectPlugin'
import type { Options } from './types'
import type createRouter from './devtoolServer/rpc/index'
import { pluginByEnv } from './logic/pluginByEnv'
import { injectDevtoolInfo } from './injects/injectVueFile'
import { injectImportDevtools } from './injects/injectMainFile'
import { injectPageFile } from './injects/injectPageFile'
import { getPagesInfo } from './logic'

export * from './types'
export type AppRouter = ReturnType<typeof createRouter>
export default function UniDevToolsPlugin(options?: Partial<Options>): Plugin[] {
  const _plugin = pluginByEnv(options)
  if (_plugin) {
    return _plugin
  }
  const port = options?.port || 5015
  process.env.UNI_DEVTOOLS_PORT = String(port)
  const inspect = loadInspectPlugin()
  const [_, pages] = getPagesInfo(options?.pageJsonPath)

  const plugin = <Plugin>{
    name: 'uni-devtools',
    enforce: 'pre',
    config() {
      return {
        define: {
          __UNI_DEVTOOLS_PORT__: JSON.stringify(port),
        },
      }
    },
    configResolved(resolvedConfig) {
      createDevtoolServe({
        port,
        resolvedConfig,
        options,
      })
    },
    transform(src, id) {
      /** 在main.js文件里注册Devtools组件 */
      const filterMainFile = createFilter(['src/main.(ts|js)', 'main.(ts|js)'])
      if (filterMainFile(id))
        return injectImportDevtools(src, id)

      /** 在根组件里获取组件信息 */
      const pagesInclude = pages.map(page => `**/${page.path}.vue`)
      const filterPages = createFilter(pagesInclude)
      if (filterPages(id))
        return injectPageFile(src, id)

      /** 注入devtools组件信息 */
      const vueFilter = createFilter(['**/*.vue'])
      if (vueFilter(id)) {
        return injectDevtoolInfo(src, id)
      }
    },
  }
  return [plugin, inspect]
}
