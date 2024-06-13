import type { Plugin } from 'vite'
import { outputFileSync, readJsonSync, removeSync } from 'fs-extra'
import { createFilter } from 'vite'
import { isH5 } from '@uni-helper/uni-env'
import JSON5 from 'json5'
import { DIR_INSPECT_LIST } from './dir'
import { createDevtoolServe } from './devtoolServer'
import { loadInspectPlugin } from './loadOtherPlugin/inspectPlugin'
import { loadVueDevtoolsPlugin } from './loadOtherPlugin/vueDevtools'
import { getDevtoolsPage } from './utils/getDevtoolsPage'
import { getPagesInfo, importDevtools, inspectDevtools } from './logic'
import type { Options } from './types'

export default function UniDevToolsPlugin(options: Partial<Options>): Plugin[] {
  if (isH5)
    return [loadVueDevtoolsPlugin(options?.vueDevtoolsOptions || {})]

  const port = options?.port || 5015
  const inspect = loadInspectPlugin()
  const app = createDevtoolServe(port)
  const [pages, pagesPath] = getPagesInfo(options?.pageJsonPath)
  const rootPath = pagesPath.replace('pages.json', '')

  const plugin = <Plugin>{
    name: 'uni-devtools',
    enforce: 'pre',
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
    /** 插件运行结束后的hooks */
    closeBundle() {
      /**
       * 获取vite-plugin-inspect插件里获取的编译文件数据接口
       */
      app.get('/api/component', async (_req, res) => {
        const json = readJsonSync(DIR_INSPECT_LIST)
        res.end(JSON.stringify(json.modules))
      })

      /**
       * 获取pages.json文件数据接口
       */
      app.get('/api/getPages', (req, res) => {
        res.end(JSON.stringify(pages))
      })
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
