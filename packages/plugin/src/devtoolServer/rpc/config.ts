import type { ResolvedConfig } from 'vite'
import { publicProcedure, router } from './../trpc'

export function ConfigRouter(config: ResolvedConfig) {
  const { query } = publicProcedure

  return router({
    getRoot: query(() => {
      return config.root
    }),
  })
}
