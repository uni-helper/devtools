import type { EventEmitter } from 'node:stream'
import type { ResolvedConfig } from 'vite'
import { z } from 'zod'
import { observable } from '@trpc/server/observable'
import { parseStack } from 'error-stack-parser-es/lite'
import { extractPathByStack, sourceFile } from '../../utils/sourceFile'
import { openInBrowser, openInEditor } from '../../openCommands'
import type { ConsoleInfo, Options } from './../../types'
import { mergeRouters, publicProcedure, router } from './../trpc'
import { AssetsRouter } from './assets'
import { versionRouter } from './version'
import { pageRouter } from './page'
import { componentRouter } from './component'
import { piniaRouter } from './pinia'
import { ConfigRouter } from './config'
import { GraphRouter } from './graph'

export default function (
  config: ResolvedConfig,
  eventEmitter: EventEmitter,
  options?: Partial<Options>,
) {
  const { input, subscription } = publicProcedure

  const routes = router({
    openInEditor: input(z.string()).query((opts) => {
      openInEditor(opts.input, options?.launchEditor ?? 'code')
    }),
    openInBrowser: input(z.string()).query(async (opts) => {
      await openInBrowser(opts.input)

      return { success: true }
    }),
    sendConsole: input(
      z.object({
        type: z.string(),
        messages: z.string(),
        stack: z.string(),
      }),
    ).subscription((opts) => {
      const { input } = opts
      const { file } = parseStack(input.stack)[1]
      const path = extractPathByStack(file!)
      const sourceFilePath = sourceFile(path)
      const consoleInfo: ConsoleInfo = {
        type: input.type,
        messages: input.messages,
        file: sourceFilePath,
      }
      console.log(consoleInfo)
      eventEmitter.emit('console', consoleInfo)
    }),
    onConsole: subscription(() => {
      return observable<ConsoleInfo>((emit) => {
        const consoleHandler = (consoleInfo: ConsoleInfo) => {
          emit.next(consoleInfo)
        }
        eventEmitter.on('console', consoleHandler)

        return () => {
          eventEmitter.off('console', consoleHandler)
        }
      })
    }),
  })

  return mergeRouters(
    routes,
    GraphRouter(),
    AssetsRouter(config),
    versionRouter(eventEmitter),
    ConfigRouter(config),
    pageRouter(eventEmitter, options),
    componentRouter(eventEmitter),
    piniaRouter(eventEmitter),
  )
}
