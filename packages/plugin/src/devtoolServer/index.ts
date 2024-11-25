import http from 'node:http'
import { EventEmitter } from 'node:stream'
import { exec, spawn } from 'node:child_process'
import polka from 'polka'
import sirv from 'sirv'
import ws from 'ws'
import detectPort from 'detect-port'

import { applyWSSHandler } from '@trpc/server/adapters/ws'
import { createExpressMiddleware } from '@trpc/server/adapters/express'

import type { ResolvedConfig } from 'vite'
import { DIR_CLIENT, DIR_TMP_INSPECT } from '../dir'
import { uniDevToolsPrint } from '../utils/print'
import type { Options } from '../types'
import createAppRouter from './rpc/index'

const eventEmitter = new EventEmitter()

/** 创建DevTools开发服务器 */
export function createDevtoolServe(
  serverOptions: {
    port: number
    resolvedConfig: ResolvedConfig
    options?: Partial<Options>
  },
) {
  const { port, resolvedConfig, options } = serverOptions
  const clientServe = sirv(DIR_CLIENT, { dev: true })
  const inspectServe = sirv(DIR_TMP_INSPECT, { dev: true })

  const server = http.createServer()
  const app = polka({ server })

  app.use('/inspect', inspectServe)
  app.use(clientServe)
  app.use(
    '/trpc',
    createExpressMiddleware({
      router: createAppRouter(resolvedConfig, eventEmitter, options),
    }),
  )

  applyWSSHandler(({
    wss: new ws.Server({ server }),
    router: createAppRouter(resolvedConfig, eventEmitter, options),
  }))

  detectPort(port).then((rightPort) => {
    app.listen(rightPort, () => {
      uniDevToolsPrint(rightPort)
      if (options?.client) {
        exec(`ud client ${rightPort}`, (error, stdout, stderr) => {
          if (error) {
            console.error(`exec error: ${error}`)
            return
          }
          console.log(`stdout: ${stdout}`)
          console.error(`stderr: ${stderr}`)
        })
      }
    })
  })

  return app
}
