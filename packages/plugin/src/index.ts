import type { Plugin } from 'vite'
import { outputFileSync, removeSync } from 'fs-extra'
import { createFilter } from 'vite'
import { isH5 } from '@uni-helper/uni-env'
import JSON5 from 'json5'
import { createExpressMiddleware } from '@trpc/server/adapters/express'
import { createDevtoolServe } from './devtoolServer'
import { loadInspectPlugin } from './loadOtherPlugin/inspectPlugin'
import { loadVueDevtoolsPlugin } from './loadOtherPlugin/vueDevtools'
import { getDevtoolsPage } from './utils/getDevtoolsPage'
import { getPagesInfo, importDevtools, inspectDevtools } from './logic'
import type { Options } from './types'
import createRouter from './devtoolServer/router'

export * from './types'
export type AppRouter = ReturnType<typeof createRouter>
export default function UniDevToolsPlugin(options?: Partial<Options>): Plugin[] {
  if (isH5)
    return [loadVueDevtoolsPlugin(options?.vueDevtoolsOptions || {})]

  const port = options?.port || 5015
  const inspect = loadInspectPlugin()
  const [pagesPath, pages] = getPagesInfo(options?.pageJsonPath)
  const rootPath = pagesPath.replace('pages.json', '')
  const app = createDevtoolServe(port)

  const plugin = <Plugin>{
    name: 'uni-devtools',
    enforce: 'pre',
    configResolved(resolvedConfig) {
      /** 注册trpc中间件 */
      app.use(
        '/trpc',
        createExpressMiddleware({
          router: createRouter(resolvedConfig, options),
        }),
      )
    },
    buildStart() {
      /**
       * uni-app编译文件时，
       * 会检查文件是否存在，
       * 在插件开始时写入临时空文件骗过uni-app
       */
      outputFileSync(`${rootPath}__uni_devtools_page__temp/index.vue`, '')
    },
    buildEnd() {
      /**
       * uni-app编译结束后，删除临时文件
       */
      removeSync(`${rootPath}__uni_devtools_page__temp`)
    },
    transform(src, id) {
      /** 在main.js文件里注册Devtools组件 */
      const filterMainFile = createFilter(['src/main.(ts|js)', 'main.(ts|js)'])
      if (filterMainFile(id))
        return importDevtools(src, id)

      /** 在根组件里插入Devtools组件 */
      const pagesInclude = pages.map(page => `**/${page.path}.vue`)
      const filterPages = createFilter(pagesInclude)
      if (filterPages(id))
        return inspectDevtools(src, id)

      /** pages.json里添加devtools路由页面 */
      const filterPagesJson = createFilter(['**/pages-json-js'])
      if (filterPagesJson(id)) {
        const pages = JSON5.parse(src)
        pages.pages.push({
          path: '__uni_devtools_page__temp/index',
          style: {
            navigationBarBackgroundColor: '#0B1015',
            navigationBarTextStyle: 'white',
          },
        })
        return JSON.stringify(pages, null, 2)
      }
    },
    load(id) {
      /** 获取devtools路由时，返回的页面数据 */
      const filter = createFilter(['**/__uni_devtools_page__temp/index.vue'])
      if (filter(id))
        return getDevtoolsPage(port)
    },
  }

  return [plugin, inspect]
}
