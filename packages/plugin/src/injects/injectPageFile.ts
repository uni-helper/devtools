import MagicString from 'magic-string'
import { parseSFC } from '../utils/parse'

export function injectPageFile(code: string, id: string) {
  const ms = new MagicString(code)
  const descriptor = parseSFC(code)
  const { scriptSetup, script } = descriptor

  if (scriptSetup) {
    const start = scriptSetup.loc.start.offset
    ms.appendRight(start, `\nimport { setCurrentPage } from '@uni-helper/devtools/inspect/initMPClient.js'\n`)
    ms.appendRight(start, `setCurrentPage()\n`)
  }
  else {
    const langAttr = script?.lang ? `lang="${script?.lang}"` : ''
    const injectScript = /* js */ `
    <script setup ${langAttr}>
    import { setCurrentPage } from '@uni-helper/devtools/inspect/initMPClient.js'
    setCurrentPage()
    </script>`
    ms.append(injectScript)
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
