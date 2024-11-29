import MagicString from 'magic-string'
import { basename } from 'pathe'
import { parseJS, parseSFC } from '../utils/parse'

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
