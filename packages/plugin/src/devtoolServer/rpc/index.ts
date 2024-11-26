import type { EventEmitter } from 'node:stream'
import { readJsonSync } from 'fs-extra'
import type { ResolvedConfig } from 'vite'
import { z } from 'zod'
import { observable } from '@trpc/server/observable'
import { parseStack } from 'error-stack-parser-es/lite'
import { extractPathByStack, sourceFile } from '../../utils/sourceFile'
import { openInBrowser, openInEditor } from '../../openCommands'
import type { ConsoleInfo, ModuleInfo, Options } from './../../types'
import { mergeRouters, publicProcedure, router } from './../trpc'
import { DIR_INSPECT_LIST } from './../../dir'
import { getImageMeta, getStaticAssets, getTextAssetContent } from './assets'
import { versionRouter } from './version'
import { pageRouter } from './page'
import { componentRouter } from './component'

export default function (
  config: ResolvedConfig,
  eventEmitter: EventEmitter,
  options?: Partial<Options>,
) {
  const { query, input, subscription } = publicProcedure

  const routes = router({
    staticAssets: query(() => {
      return getStaticAssets(config)
    }),
    getImageMeta: input(z.string()).query(({ input }) => {
      return getImageMeta(input)
    }),
    getTextAssetContent: input(z.string()).query(({ input }) => {
      return getTextAssetContent(input)
    }),
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
    versionRouter(eventEmitter),
    pageRouter(eventEmitter, options),
    componentRouter(eventEmitter),
  )
}
