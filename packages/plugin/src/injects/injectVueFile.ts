import MagicString from 'magic-string'
import { basename } from 'pathe'
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

  if (scriptSetup) {
    const constent = parseScript(descriptor, id)
    const bindings = constent.bindings
    if (bindings) {
      const validSoures = ['vue', '@dcloudio/uni-app']
      const imports = Object.entries(constent.imports || {}).map(([key, value]) => {
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
        const watchCode = `
        ;import {setupProxy} from '@uni-helper/devtools/inspect/setupProxy.js';
        ;const bindings = {${watchBindings.join(', ')}};
        ;setupProxy(bindings, '${fileName}');`
        const end = scriptSetup.loc.end.offset
        ms.appendRight(end, watchCode)
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
