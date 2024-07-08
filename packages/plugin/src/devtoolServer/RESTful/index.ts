import type { EventEmitter } from 'node:stream'
import type polka from 'polka'
import { parseStack } from 'error-stack-parser-es/lite'
import type { ConsoleInfo } from '../../types'
import { extractPathByStack, sourceFile } from './../../utils/sourceFile'

export function setupUserRoutes(
  app: polka.Polka,
  eventEmitter: EventEmitter,
) {
  app.post('/api/console', (req, res) => {
    const { body } = req

    const { file, line } = parseStack(body.stack)[1]
    const path = extractPathByStack(file!)
    const sourceFilePath = sourceFile(path)
    const consoleInfo: ConsoleInfo = {
      type: body.type,
      messages: body.messages,
      stack: {
        file: sourceFilePath,
        line: line ?? 0,
      },
    }
    eventEmitter.emit('console', consoleInfo)
    res.end(JSON.stringify({ status: 'success' }))
  })
}
