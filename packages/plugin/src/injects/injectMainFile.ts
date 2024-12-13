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

// function findReturnStatementInCreateAppPosition(ast: Node): number | null {
//   let position: number | null = null

//   walk.simple(ast, {
//     FunctionDeclaration(node) {
//       if ((node as FunctionDeclaration).id.name === 'createApp') {
//         walk.simple(node.body, {
//           ReturnStatement(returnNode) {
//             position = returnNode.start
//           },
//         })
//       }
//     },
//   })

//   return position
// }

export function injectImportDevtools(code: string, id: string) {
  const ms = new MagicString(code)
  const hasPinia = isPackageExists('pinia')
  const ast = parseJS(code)

  const importer = [
    // `import UniDevTools from '@uni-helper/devtools/inspect/UniDevTools.vue';`,
    // `import {proxyConsole} from '@uni-helper/devtools/inspect/proxyConsole.js';`,
    `import {initMPClient} from '@uni-helper/devtools/inspect/initMPClient.js';`,
    `import {trpc} from '@uni-helper/devtools/inspect/trpc.js'`,
  ]
  const injectFunc = [
    `uni.$trpc = trpc`,
    // `proxyConsole();`,
    `initMPClient();`,
  ]

  if (hasPinia) {
    importer.push(`import piniaPluginProxy from '@uni-helper/devtools/inspect/piniaProxy.js';`)

    const position = findCreatePiniaPosition(ast)
    if (position) {
      ms.appendRight(position, `.use(piniaPluginProxy)`)
    }
    else {
      console.log(c.bgRedBright(' UNI-DEVTOOLS '), `未找到${c.bgRedBright(' createPinia ')}，请检查pinia是否被正确引入`)
    }
  }

  ms.prepend(`\n${injectFunc.join('\n')}\n`)
  ms.prepend(`${importer.join('\n')}\n`)

  // const component = `app.component('uni-dev-tools', UniDevTools);`
  // const position = findReturnStatementInCreateAppPosition(ast)
  // if (position) {
  //   ms.appendLeft(position, `\n${component}\n`)
  // }
  // else {
  //   console.log(c.bgRedBright(' UNI-DEVTOOLS '), '未找到createApp，请检查是否正确引入vue')
  // }

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
