import MagicString from 'magic-string'
import { isPackageExists } from 'local-pkg'
import type { Identifier, Node } from 'acorn'
import walk from 'acorn-walk'
import c from 'picocolors'
import { parseJS } from '../utils/parse'

function findCreatePiniaPosition(ast: Node): number | null {
  let position: number | null = null

  walk.simple(ast, {
    CallExpression(node) {
      if (
        (node.callee.type === 'MemberExpression' && (node.callee.property as Identifier).name === 'createPinia')
        || (node.callee.type === 'Identifier' && node.callee.name === 'createPinia')
      ) {
        position = node.end
      }
    },
  })

  return position
}

export function injectImportDevtools(code: string, id: string) {
  const ms = new MagicString(code)
  const hasPinia = isPackageExists('pinia')
  const ast = parseJS(code)

  const importer = [
    `import {initMPClient} from '@uni-helper/devtools/inspect/initMPClient.js';`,
    `import {trpc} from '@uni-helper/devtools/inspect/trpc.js'`,
  ]
  const injectFunc = [
    `uni.$trpc = trpc`,
    `initMPClient();`,
  ]

  if (hasPinia) {
    importer.push(`import piniaPluginProxy from '@uni-helper/devtools/inspect/piniaProxy.js';`)

    const position = findCreatePiniaPosition(ast)
    if (position) {
      ms.appendRight(position, `.use(piniaPluginProxy)`)
    }
    else {
      console.log(c.yellow(' UNI-DEVTOOLS '), `未找到 createPinia 调用，Pinia 状态管理功能将不可用。如需使用，请在 main.ts 中正确初始化 Pinia`)
    }
  }

  ms.prepend(`\n${injectFunc.join('\n')}\n`)
  ms.prepend(`${importer.join('\n')}\n`)

  const map = ms.generateMap({
    source: id,
    file: `${id}.map`,
    includeContent: true,
  })

  return {
    code: ms.toString(),
    map,
  }
}
