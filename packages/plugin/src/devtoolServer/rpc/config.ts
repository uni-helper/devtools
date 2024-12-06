import type { ResolvedConfig } from 'vite'
import { platform } from '@uni-helper/uni-env'
import { publicProcedure, router } from './../trpc'

export function ConfigRouter(config: ResolvedConfig) {
  const { query } = publicProcedure

  return router({
    getRoot: query(() => {
      return config.root
    }),
    getPlatform: query(() => {
      return platform
    }),
  })
}
