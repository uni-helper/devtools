import { parse } from '@vue/compiler-sfc'
import MagicString from 'magic-string'

export async function inspectDevtools(code: string, id: string) {
  const ms = new MagicString(code)
  const { descriptor } = parse(code)
  const { template } = descriptor
  const end = template?.loc.end.offset
  if (end)
    ms.appendRight(end, `\n<uni-dev-tools />\n`)

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
