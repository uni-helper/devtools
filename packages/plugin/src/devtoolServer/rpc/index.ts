import type { EventEmitter } from 'node:stream'
import { readJsonSync } from 'fs-extra'
import type { ResolvedConfig } from 'vite'
import { z } from 'zod'
import { observable } from '@trpc/server/observable'
import type { LogInfo, ModuleInfo, Options } from './../../types'
import { getPagesInfo } from './../../logic'
import { publicProcedure, router } from './../trpc'
import { DIR_INSPECT_LIST } from './../../dir'
import { getImageMeta, getStaticAssets, getTextAssetContent } from './assets'
import { openInEditor } from './openInEditor'
import openInBrowser from './openInBrowser'

const logInfoList: LogInfo[] = []

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
    onLog: subscription(() => {
      return observable<LogInfo[]>((emit) => {
        const logHandler = (log: LogInfo) => {
          logInfoList.push(log)
          emit.next([log])
        }

        emit.next(logInfoList)
        eventEmitter.on('log', logHandler)

        return () => {
          eventEmitter.off('log', logHandler)
        }
      })
    }),
  })
}
