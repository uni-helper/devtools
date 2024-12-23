import MagicString from 'magic-string'
import { basename } from 'pathe'
import type { FunctionExpression, ObjectExpression } from 'acorn'
import { parseSFC, parseScript } from '../utils/parse'

export async function injectDevtoolInfo(code: string, id: string) {
  const ms = new MagicString(code)
  const descriptor = parseSFC(code)
  const { script, scriptSetup } = descriptor

  const fileName = basename(id, '.vue')
  const inspectInfo = `
  fileName: "${fileName}",
  filePath: "${id}",`

  const exportInspectInfo = `;export default {${inspectInfo}}`

  if (scriptSetup || script) {
    const content = parseScript(descriptor, id)
    const ast = content.scriptAst
    const ExportDefaultDeclarationNode = ast?.find(node => node.type === 'ExportDefaultDeclaration')

    const exportNodeEndLoc = ExportDefaultDeclarationNode?.end
    const hasExtra = ExportDefaultDeclarationNode?.extra
    // inject component file data

    if (script) {
      if (exportNodeEndLoc) {
        ms.appendLeft(exportNodeEndLoc - 1, hasExtra ? inspectInfo : `,${inspectInfo}`)
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

    // inject watch
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
        ;setupProxy(bindings);
        `
        if (scriptSetup) {
          const watchCode = `
          ${importWatchCode}
          ${setupProxyCode}`

          const end = scriptSetup.loc.end.offset
          ms.appendRight(end, watchCode)
        }
        else {
          const scriptStartLoc = content.loc.start.offset
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
              ms.appendRight(scriptStartLoc!, `;import {positionWatchBindings} from '@uni-helper/devtools/inspect/setupProxy.js';`)

              const watchCode = /* js */`
              watch: {
                '$data': {
                  handler(newValue) {
                    const id = this.$.uid
                    positionWatchBindings(newValue, id)
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
  else {
    const inspectScript = `<script>${exportInspectInfo}</script>`
    ms.append(inspectScript)
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
