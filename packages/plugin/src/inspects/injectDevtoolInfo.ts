import { parse } from '@vue/compiler-sfc'
import MagicString from 'magic-string'
import { basename } from 'pathe'

export function injectDevtoolInfo(code: string, id: string) {
  const ms = new MagicString(code)
  const { descriptor } = parse(code)
  const script = descriptor.script
  const inspectInfo = /* js */`
    ;const __uni_devtoolInfo = {
      name: "${basename(id, '.vue')}",
      filename: "${id}",
    }
  `

  if (script) {
    ms.appendRight(script.loc.end.offset, inspectInfo)
  }
  else {
    const lang = descriptor.scriptSetup?.lang
    const langContet = lang === 'ts' ? 'lang="ts"' : ''
    const inspectScript = /* js */`
      <script ${langContet}>${inspectInfo}</script>
    `
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
