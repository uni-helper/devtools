import type { Plugin, ViteDevServer } from 'vite'
import { globSync } from 'glob'
import { readJsonSync } from 'fs-extra'
import sirv from 'sirv'
import { createRPCServer } from 'vite-dev-rpc'
import type { Pages, PagesJson } from './types'
import { DIR_CLIENT } from './dir'

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

export default function vitePluginPages(): Plugin {
  let pages: Pages[]

  return {
    name: 'uni-devtools',
    enforce: 'pre',
    configureServer(server) {
      console.log('======configureServer========')
      server.middlewares.use(
        `/__devtools`,
        sirv(DIR_CLIENT, {
          single: true,
          dev: true,
        }),
      )
    },
    buildStart() {
      console.log("======buildStart========")
      const files = globSync(
        '**/pages.json',
        {
          ignore: ['**/node_modules/**'],
        },
      )
      const pagesJson = readJsonSync(files[0]) as PagesJson
      pages = pagesJson.pages
    },
    buildEnd() {
      console.log("======buildEnd========")
    },
    transform(src, id) {
      let code = src
      pages.forEach((page) => {
        if (id.includes(page.path)) {
          const contentToInsert = '<UniDevTools />'
          const template = insertBeforeTemplate(src, contentToInsert)
          const contentImport = `import UniDevTools from 'uni-devtools/src/node/UniDevTools.vue';`
          code = insertBeforeScript(template, contentImport)
        }
      })
      return {
        code,
      }
    },
  }
}
