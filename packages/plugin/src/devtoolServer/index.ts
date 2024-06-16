import polka from 'polka'
import sirv from 'sirv'
import { createExpressMiddleware } from '@trpc/server/adapters/express'
import { DIR_CLIENT, DIR_TMP_INSPECT } from '../dir'
import { uniDevToolsPrint } from '../utils/print'
import type { Pages } from '../types'
import createRouter from './router'

/** 创建DevTools开发服务器 */
export function createDevtoolServe(
  port: number,
  pageInfo: {
    pages: Pages[]
    tabBarList: string[] | undefined
  },
) {
  const clientServe = sirv(DIR_CLIENT, { dev: true })
  const inspectServe = sirv(DIR_TMP_INSPECT, { dev: true })

  const app = polka()

  app.use('/inspect', inspectServe)
  app.use(clientServe)
  app.use(
    '/trpc',
    createExpressMiddleware({
      router: createRouter(pageInfo),
    }),
  )

  app.listen(port, () => {
    uniDevToolsPrint(port)
  })

  return app
}

export type AppRouter = ReturnType<typeof createRouter>
