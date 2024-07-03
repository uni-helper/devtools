import type { EventEmitter } from 'node:stream'
import { readJsonSync } from 'fs-extra'
import type { ResolvedConfig } from 'vite'
import { z } from 'zod'
import { observable } from '@trpc/server/observable'
import type { ModuleInfo, Options } from '../types'
import { getPagesInfo } from '../logic'
import { publicProcedure, router } from './trpc'
import { DIR_INSPECT_LIST } from './../dir'
import { getImageMeta, getStaticAssets, getTextAssetContent } from './rpc/assets'
import { openInEditor } from './rpc/openInEditor'
import openInBrowser from './rpc/openInBrowser'

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
    update: input(z.string()).mutation((opts) => {
      const post = opts.input
      eventEmitter.emit('update', post)

      return { success: true }
    }),
    onGetComponent: subscription(() => {
      return observable<string>((emit) => {
        eventEmitter.on('getComponent', emit.next)

        return () => {
          eventEmitter.off('getComponent', emit.next)
        }
      })
    }),
    onUpdate: input(z.string()).subscription((opts) => {
      console.log(opts)
      console.log('onUpdate', opts.input)
      return observable<string>((emit) => {
        eventEmitter.on('update', emit.next)

        return () => {
          eventEmitter.off('update', emit.next)
        }
      })
    }),
  })
}
