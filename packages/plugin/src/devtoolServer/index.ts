import http from 'node:http'
import { EventEmitter } from 'node:stream'
import polka from 'polka'
import sirv from 'sirv'
import ws from 'ws'

import { applyWSSHandler } from '@trpc/server/adapters/ws'
import { createExpressMiddleware } from '@trpc/server/adapters/express'

import type { ResolvedConfig } from 'vite'
import { DIR_CLIENT, DIR_TMP_INSPECT } from '../dir'
import { uniDevToolsPrint } from '../utils/print'
import type { Options } from '../types'
import createAppRouter from './router'

const eventEmitter = new EventEmitter()

/** 创建DevTools开发服务器 */
export function createDevtoolServe(
  serverOptions: {
    port: number
    config: ResolvedConfig
    options?: Partial<Options>
  },
) {
  const { port, config, options } = serverOptions
  const clientServe = sirv(DIR_CLIENT, { dev: true })
  const inspectServe = sirv(DIR_TMP_INSPECT, { dev: true })

  const server = http.createServer()
  const app = polka({ server })

  app.use('/inspect', inspectServe)
  app.use(clientServe)
  app.use(
    '/trpc',
    createExpressMiddleware({
      router: createAppRouter(config, eventEmitter, options),
    }),
  )

  app.listen(port, () => {
    uniDevToolsPrint(port)
  })

  applyWSSHandler(({
    wss: new ws.Server({ server }),
    router: createAppRouter(config, eventEmitter, options),
  }))

  return app
}
