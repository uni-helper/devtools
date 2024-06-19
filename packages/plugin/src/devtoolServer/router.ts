import { readJsonSync } from 'fs-extra'
import type { ResolvedConfig } from 'vite'
import type { ModuleInfo, Options } from '../types'
import { getPagesInfo } from '../logic'
import { publicProcedure, router } from './trpc'
import { DIR_INSPECT_LIST } from './../dir'
import { getStaticAssets } from './rpc/assets'

export default function (
  config: ResolvedConfig,
  options?: Partial<Options>,
) {
  const { query } = publicProcedure

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
      console.log('staticAssets')
      return getStaticAssets(config)
    }),
  })
}
