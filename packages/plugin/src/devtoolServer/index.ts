import polka from 'polka'
import sirv from 'sirv'
import ws from 'ws'
import { applyWSSHandler } from '@trpc/server/adapters/ws'
import type { ResolvedConfig } from 'vite'
import { DIR_CLIENT, DIR_TMP_INSPECT } from '../dir'
import { uniDevToolsPrint } from '../utils/print'
import type { Options } from '../types'
import createAppRouter from './router'
/** 创建DevTools开发服务器 */
export function createDevtoolServe(
  serverOptions: {
    port: number
    config: ResolvedConfig
    options?: Partial<Options>
  },
) {
  const { port } = serverOptions
  const clientServe = sirv(DIR_CLIENT, { dev: true })
  const inspectServe = sirv(DIR_TMP_INSPECT, { dev: true })

  const app = polka()

  app.use('/inspect', inspectServe)
  app.use(clientServe)

  app.listen(port, () => {
    uniDevToolsPrint(port)
  })

  // applyWSSHandler(({
  //   wss: new ws.Server({ server }),
  //   router: createAppRouter(config, options),
  // }))

  return app
}
