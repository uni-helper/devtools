import http from 'node:http'
import type { Plugin } from 'vite'
import { globSync } from 'glob'
import { outputFileSync, readJsonSync, removeSync } from 'fs-extra'
import sirv from 'sirv'
import { createBirpc } from 'birpc'
import { parse } from '@vue/compiler-sfc'
import { WebSocketServer } from 'ws'
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
      const serve = sirv(DIR_CLIENT, {
        single: true,
        dev: true,
      })

      const server = http.createServer((req, res) => {
        serve(req, res, () => {
          res.statusCode = 404
          res.end('Not found')
        })
      })

      const wss = new WebSocketServer({ server })
      const serverFunctions = {
        hi(name: string) {
          return `Hi ${name} from server`
        },
      }
      wss.on('connection', async (ws) => {
        const rpc = createBirpc(
          serverFunctions,
          {
            post: data => ws.send(data),
            on: data => ws.on('message', data),
            serialize: v => JSON.stringify(v),
            deserialize: v => JSON.parse(v),
          },
        )

        await rpc.hey('Server') // Hey Server from client
      })

      server.listen(3000, () => {
        console.log('Server listening on http://localhost:3000')
      })
      const files = globSync(
        '**/pages.json',
        {
          ignore: ['**/node_modules/**'],
        },
      )
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
