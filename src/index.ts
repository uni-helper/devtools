import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { type Plugin, normalizePath } from 'vite'
import { globSync } from 'fast-glob'
import { readJsonSync } from 'fs-extra'
import type { Pages, PagesJson } from './types'

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

function insertBeforeScript(originalString: string, contentToInsert: string) {
  // 检查是否存在</template>标签
  const templateTagIndex = originalString.indexOf('</script>')
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

function getUniDevtoolsPath() {
  const pluginPath = normalizePath(path.dirname(fileURLToPath(import.meta.url)))
  return pluginPath.replace(/\/dist$/, '/\/src/node')
}

export default function vitePluginPages(): Plugin {
  let pages: Pages[]
  const uniDevtoolsPath = getUniDevtoolsPath()

  return {
    name: 'uni-devtools',
    enforce: 'pre',
    buildStart() {
      const file = globSync(
        '**/pages.json',
        {
          ignore: ['**/node_modules/**'],
        },
      )
      const pagesJson = readJsonSync(file[0]) as PagesJson
      pages = pagesJson.pages
    },
    resolveId(id) {
      if (id.startsWith('virtual:uni-devtools-path:')) {
        const resolved = id.replace('virtual:uni-devtools-path:', `${uniDevtoolsPath}/`)
        return resolved
      }
    },
    transform(src, id) {
      let code = src
      pages.forEach((page) => {
        if (id.includes(page.path)) {
          const contentToInsert = '<UniDevTools />'
          const template = insertBeforeTemplate(src, contentToInsert)
          const contentImport = `import UniDevTools from 'virtual:uni-devtools-path:UniDevTools.vue';`
          code = insertBeforeScript(template, contentImport)
        }
      })

      return {
        code,
      }
    },
  }
}
