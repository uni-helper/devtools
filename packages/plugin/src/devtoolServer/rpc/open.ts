import { z } from 'zod'
import { openInBrowser, openInDevtools, openInEditor } from '../../openCommands'
import { publicProcedure, router } from './../trpc'
import type { Options } from './../../types'

export function OpenRouter(options?: Partial<Options>) {
  const { input, query } = publicProcedure

  return router({
    openInEditor: input(z.string()).query((opts) => {
      openInEditor(opts.input, options?.launchEditor ?? 'code')
    }),
    openInBrowser: input(z.string()).query(async (opts) => {
      await openInBrowser(opts.input)

      return { success: true }
    }),
    openInClient: query(() => {
      console.log('openInClien')
      openInDevtools()
    }),
  })
}
