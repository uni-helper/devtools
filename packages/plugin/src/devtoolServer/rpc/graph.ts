import type { ModuleInfo } from '@uni-helper/devtools-types'
import fs from 'fs-extra'
import { DIR_INSPECT_LIST } from '../../dir'
import { publicProcedure, router } from './../trpc'

export function GraphRouter() {
  const { query } = publicProcedure

  return router({
    getModules: query(() => {
      const json = fs.readJsonSync(DIR_INSPECT_LIST)
      return json.modules as ModuleInfo[]
    }),
  })
}
