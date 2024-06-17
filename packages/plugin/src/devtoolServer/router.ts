import { readJsonSync } from 'fs-extra'
import type { Options } from '../types'
import { getPagesInfo } from '../logic'
import { publicProcedure, router } from './trpc'
import { DIR_INSPECT_LIST } from './../dir'

export default function (options?: Partial<Options>) {
  const { query } = publicProcedure

  return router({
    getComponent: query(() => {
      const json = readJsonSync(DIR_INSPECT_LIST)
      return json.modules
    }),
    getPages: query(() => {
      const [_, pages] = getPagesInfo(options?.pageJsonPath)

      return pages
    }),
  })
}
