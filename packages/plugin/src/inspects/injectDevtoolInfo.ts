import MagicString from 'magic-string'
import { basename } from 'pathe'
import { parseJS, parseSFC } from '../utils/parse'

export async function injectDevtoolInfo(code: string, id: string) {
  const ms = new MagicString(code)
  const descriptor = parseSFC(code)
  const script = descriptor.script

  const inspectInfo = `
  fileName: "${basename(id, '.vue')}",
  filePath: "${id}",`

  const exportInspectInfo = `;export default {${inspectInfo}}`

  if (script) {
    const content = script.content
    const ast = parseJS(content)
    const exportDefaultStart = ast.body.find(node => node.type === 'ExportDefaultDeclaration')?.declaration.start

    if (!exportDefaultStart) {
      ms.appendRight(script.loc.end.offset, exportInspectInfo)
    }
    else {
      ms.appendRight(exportDefaultStart + 1, inspectInfo)
    }
  }
  else {
    const lang = descriptor.scriptSetup?.lang
    const langContet = lang === 'ts' ? 'lang="ts"' : ''
    const inspectScript = `<script ${langContet}>${exportInspectInfo}</script>`
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
