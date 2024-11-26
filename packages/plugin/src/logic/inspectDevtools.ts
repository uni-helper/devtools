import MagicString from 'magic-string'
import { parseSFC } from '../utils/parse'

export async function inspectDevtools(code: string, id: string) {
  const ms = new MagicString(code)
  const descriptor = parseSFC(code)
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
