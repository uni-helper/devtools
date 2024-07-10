import type { EventEmitter } from 'node:stream'
import { readJsonSync } from 'fs-extra'
import type { ResolvedConfig } from 'vite'
import { z } from 'zod'
import { observable } from '@trpc/server/observable'
import { parseStack } from 'error-stack-parser-es/lite'
import { extractPathByStack, sourceFile } from '../../utils/sourceFile'
import type { ConsoleInfo, ModuleInfo, Options } from './../../types'
import { getPagesInfo } from './../../logic'
import { publicProcedure, router } from './../trpc'
import { DIR_INSPECT_LIST } from './../../dir'
import { getImageMeta, getStaticAssets, getTextAssetContent } from './assets'
import { openInEditor } from './openInEditor'
import openInBrowser from './openInBrowser'

const consoleInfoList: ConsoleInfo[] = []

export default function (
  config: ResolvedConfig,
  eventEmitter: EventEmitter,
  options?: Partial<Options>,
) {
  const { query, input, subscription } = publicProcedure

  return router({
    getComponent: query(() => {
      const json = readJsonSync(DIR_INSPECT_LIST)
      return json.modules as ModuleInfo[]
    }),
    getPages: query(() => {
      const [_, pages] = getPagesInfo(options?.pageJsonPath)

      return pages
    }),
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
      const { file, line } = parseStack(input.stack)[1]
      const path = extractPathByStack(file!)
      const sourceFilePath = sourceFile(path)
      const consoleInfo: ConsoleInfo = {
        ...input,
        stack: {
          file: sourceFilePath,
          line: line ?? 0,
        },
      }
      console.log(input)
      console.log(consoleInfo)
      eventEmitter.emit('console', consoleInfo)
    }),
    onConsole: subscription(() => {
      return observable<ConsoleInfo[]>((emit) => {
        const consoleHandler = (consoleInfo: ConsoleInfo) => {
          consoleInfoList.push(consoleInfo)
          emit.next([consoleInfo])
        }

        emit.next(consoleInfoList)
        eventEmitter.on('console', consoleHandler)

        return () => {
          eventEmitter.off('console', consoleHandler)
        }
      })
    }),
  })
}
