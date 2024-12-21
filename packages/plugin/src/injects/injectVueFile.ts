import MagicString from 'magic-string'
import { basename } from 'pathe'
import type { FunctionExpression, ObjectExpression } from 'acorn'
import { parseJS, parseSFC, parseScript } from '../utils/parse'

export async function injectDevtoolInfo(code: string, id: string) {
  const ms = new MagicString(code)
  const descriptor = parseSFC(code)
  const { script, scriptSetup } = descriptor

  const fileName = basename(id, '.vue')
  const inspectInfo = `
  fileName: "${fileName}",
  filePath: "${id}",`

  const exportInspectInfo = `;export default {${inspectInfo}}`

  // TODO? 优化--共用一个parse
  // TODO! 支持具名默认导出
  if (script) {
    const content = script.content
    const ast = parseJS(content)
    const exportDefaultStart = ast.body.find(node => node.type === 'ExportDefaultDeclaration')?.declaration.start

    if (exportDefaultStart) {
      ms.appendRight(exportDefaultStart + 1, inspectInfo)
    }
    else {
      ms.appendRight(script.loc.end.offset, exportInspectInfo)
    }
  }
  else {
    const langAttr = scriptSetup?.lang ? `lang="${scriptSetup.lang}"` : ''
    const inspectScript = `<script ${langAttr}>${exportInspectInfo}</script>`
    ms.append(inspectScript)
  }

  if (scriptSetup || script) {
    const content = parseScript(descriptor, id)
    const bindings = content.bindings
    if (bindings) {
      const validSoures = ['vue', '@dcloudio/uni-app']
      const imports = Object.entries(content.imports || {}).map(([key, value]) => {
        if (validSoures.includes(value.source) || value.source.endsWith('.vue')) {
          return key
        }
        else {
          return null
        }
      }).filter(Boolean)
      const watchBindings = Object.keys(bindings).map((key) => {
        if (imports.includes(key)) {
          return null
        }
        else {
          return key
        }
      }).filter(Boolean)
      if (watchBindings.length > 0) {
        const importWatchCode = `;import {setupProxy} from '@uni-helper/devtools/inspect/setupProxy.js';`
        const setupProxyCode = `
        ;const bindings = {${watchBindings.join(', ')}};
        ;setupProxy(bindings, '${fileName}');
        `
        if (scriptSetup) {
          const watchCode = `
          ${importWatchCode}
          ${setupProxyCode}`

          const end = scriptSetup.loc.end.offset
          ms.appendRight(end, watchCode)
        }
        else {
          const ast = content.scriptAst
          const scriptStartLoc = content.loc.start.offset
          const ExportDefaultDeclarationNode = ast?.find(node => node.type === 'ExportDefaultDeclaration')
          if (ExportDefaultDeclarationNode) {
            const ObjectExpressionNode = ExportDefaultDeclarationNode.declaration as ObjectExpression
            const SetupNode = ObjectExpressionNode.properties.find((node: any) => {
              if (node.type === 'ObjectMethod' && node.key.type === 'Identifier' && node.key.name === 'setup') {
                return true
              }
              return false
            }) as FunctionExpression | undefined
            // composition api
            if (SetupNode) {
              const SetupBlockNode = SetupNode.body
              const SetupReturnNodeStart = SetupBlockNode.body.find(node => node.type === 'ReturnStatement')?.start
              // append import on script
              ms.appendRight(scriptStartLoc, importWatchCode)
              // append setupProxy function
              ms.appendRight(SetupReturnNodeStart!, setupProxyCode)
            }
            // option api
            else {
              ms.appendRight(scriptStartLoc!, `;import { stringify } from '@vue/devtools-kit';`)

              const exportNodeEndLoc = ExportDefaultDeclarationNode.end
              const hasExtra = ExportDefaultDeclarationNode.extra
              const watchCode = /* js */`
              ${hasExtra ? '' : ','}watch: {
                '$data': {
                  handler(newValue) {
                  console.log("option",newValue)
                    for (const key in newValue) {
                      const trpc = uni.$trpc
                      trpc.sendComponentData.subscribe(
                        {
                          fileName: '${fileName}',
                          key,
                          value: stringify([newValue[key]]),
                        },
                        {
                          onComplete: () => {},
                          onError: error => console.error(error),
                        },
                      )
                    }
                  },
                  deep: true,
                  immediate: true,
                },
              }
              `
              ms.appendLeft(exportNodeEndLoc! - 1, watchCode)
            }
          }
        }
      }
    }
  }

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
