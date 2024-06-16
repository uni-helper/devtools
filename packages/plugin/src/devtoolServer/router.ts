import { readJsonSync } from 'fs-extra'
import { publicProcedure, router } from './trpc'
import { DIR_INSPECT_LIST } from './../dir'

export default function (pageInfo: any) {
  const { query } = publicProcedure

  return router({
    getComponent: query(() => {
      const json = readJsonSync(DIR_INSPECT_LIST)
      return json.modules
    }),
    getPages: query(() => {
      return pageInfo
    }),
  })
}
