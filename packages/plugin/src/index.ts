import { cwd } from 'node:process'
import type { Plugin } from 'vite'
import { globSync } from 'fast-glob'
import { outputFileSync, readJsonSync, removeSync } from 'fs-extra'
import { getPackageInfo } from 'local-pkg'
import { createFilter } from 'vite'
import type { Pages, PagesJson } from './types'
import { DIR_INSPECT_LIST } from './dir'
import { createDevtoolServe } from './devtoolServer'
import { loadInspectPlugin } from './loadOtherPlugin/inspectPlugin'
import { getDevtoolsPage } from './utils/getDevtoolsPage'
import { importDevtools } from './logic'

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
export default function UniDevToolsPlugin(): Plugin[] {
  let pages: Pages[]
  let rootPath: string
  const port = 4498

  const inspect = loadInspectPlugin()
  const app = createDevtoolServe(port)

  const files = globSync('**/pages.json', {
    ignore: ['**/node_modules/**'],
  })

  app.get('api/dependencies', async (res, req) => {
    const pkg = await getPackageInfo(cwd())
    req.end(JSON.stringify(pkg))
  })
  const plugin = <Plugin>{
    name: 'uni-devtools',
    enforce: 'pre',
    buildStart() {
      app.get('/api/component', async (_req, res) => {
        const json = readJsonSync(DIR_INSPECT_LIST)
        res.end(JSON.stringify(json.modules))
      })

      const pagesJson = readJsonSync(files[0]) as PagesJson
      pages = pagesJson.pages
      app.get('/api/getPages', (req, res) => {
        res.end(JSON.stringify(pages))
      })
      rootPath = files[0].replace('pages.json', '')
      outputFileSync(`${rootPath}__uni_devtools_page__temp/index.vue`, '')
    },
    buildEnd() {
      removeSync(`${rootPath}__uni_devtools_page__temp`)
    },
    transform(src, id) {
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
      if (id.endsWith('__uni_devtools_page__temp/index.vue'))
        return getDevtoolsPage(port)
    },
  }

  return [
    plugin,
    inspect,
  ]
}
