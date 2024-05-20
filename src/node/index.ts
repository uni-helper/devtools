import type { Plugin } from 'vite'
import { globSync } from 'glob'
import { outputFileSync, readJsonSync, removeSync } from 'fs-extra'
import { parse } from '@vue/compiler-sfc'
import type { Pages, PagesJson } from './types'
import { DIR_CLIENT } from './dir'
import { createDevtoolServe } from './DevtoolServer'

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

export function parseSFC(code: string, id: string) {
  const { descriptor } = parse(code, {
    filename: id,
  })
  const isTs = (descriptor.script || descriptor.scriptSetup)?.lang === 'ts'

  return {
    templateContent: descriptor.template?.content,
    isTs,
  }
}
export default function UniDevToolsPlugin(): Plugin {
  let pages: Pages[]
  let rootPath: string

  return {
    name: 'uni-devtools',
    enforce: 'pre',
    configurePreviewServer() {
      console.log('===================')
    },
    configureServer() {
      console.log('===================')
    },
    buildStart() {
      createDevtoolServe(DIR_CLIENT)
      const files = globSync('**/pages.json', {
        ignore: ['**/node_modules/**'],
      })
      const pagesJson = readJsonSync(files[0]) as PagesJson
      pages = pagesJson.pages
      rootPath = files[0].replace('pages.json', '')
      outputFileSync(`${rootPath}__uni_devtools_page__temp/index.vue`, '')
    },
    buildEnd() {
      removeSync(`${rootPath}__uni_devtools_page__temp`)
    },
    transform(src, id) {
      let code = src
      pages.forEach((page) => {
        if (id.endsWith(`${page.path}.vue`)) {
          const { isTs } = parseSFC(src, id)
          const contentToInsert = '<UniDevTools />'
          const template = insertBeforeTemplate(src, contentToInsert)
          const contentImport = `
          <script ${isTs && 'lang="ts"'}>
          import UniDevTools from 'uni-devtools/src/node/UniDevTools.vue'
          </script>`
          code = contentImport + template
        }
      })
      if (id.endsWith('pages-json-js')) {
        const pages = JSON.parse(src)
        pages.pages.push({
          path: '__uni_devtools_page__temp/index',
        })
        code = JSON.stringify(pages, null, 2)
      }
      return {
        code,
      }
    },
    load(id) {
      if (id.endsWith('__uni_devtools_page__temp/index.vue')) {
        return `
      <template>
        <web-view src="http://localhost:3000" />
      </template>
      `
      }
    },
  }
}
