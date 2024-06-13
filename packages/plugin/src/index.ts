import { cwd } from 'node:process'
import type { Plugin } from 'vite'
import { outputFileSync, readJsonSync, removeSync } from 'fs-extra'
import { createFilter } from 'vite'
import { isH5 } from '@uni-helper/uni-env'
import { DIR_INSPECT_LIST } from './dir'
import { createDevtoolServe } from './devtoolServer'
import { loadInspectPlugin } from './loadOtherPlugin/inspectPlugin'
import { loadVueDevtoolsPlugin } from './loadOtherPlugin/vueDevtools'
import { getDevtoolsPage } from './utils/getDevtoolsPage'
import { getPagesInfo, importDevtools } from './logic'
import type { Options } from './types'

function insertBeforeTemplate(originalString: string, contentToInsert: string) {
  // 检查是否存在</template>标签
  const templateTagIndex = originalString.indexOf('</template>')
  if (templateTagIndex === -1) {
    // 如果不存在</template>，直接返回原始字符串
    return originalString
  }

  // 将原始字符串分为两部分：插入点之前和之后
  const partBeforeTemplate = originalString.substring(0, templateTagIndex)
  const partAfterTemplate = originalString.substring(templateTagIndex)

  // 将新内容插入到</template>标签前面
  const newString = `${partBeforeTemplate + contentToInsert}\n${partAfterTemplate}`

  return newString
}

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

      let code = src
      pages.forEach((page) => {
        if (id.endsWith(`${page.path}.vue`)) {
          const contentToInsert = '<UniDevTools />'
          const template = insertBeforeTemplate(src, contentToInsert)
          code = template
        }
      })

      /** pages.json里添加devtools路由页面 */
      const filterPagesJson = createFilter(['**/pages-json-js'])
      if (filterPagesJson(id)) {
        const pages = JSON.parse(src)
        pages.pages.push({
          path: '__uni_devtools_page__temp/index',
        })
        return JSON.stringify(pages, null, 2)
      }
      return {
        code,
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
