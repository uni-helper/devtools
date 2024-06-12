import polka from 'polka'
import sirv from 'sirv'
import { DIR_CLIENT, DIR_TMP_INSPECT } from '../dir'
import { uniDevToolsPrint } from '../utils/print'

export function createDevtoolServe(port: number) {
  const clientServe = sirv(DIR_CLIENT, { dev: true })
  const inspectServe = sirv(DIR_TMP_INSPECT, { dev: true })

  const app = polka()

  app.use('/inspect', inspectServe)
  app.use(clientServe)

  app.listen(port, () => {
    uniDevToolsPrint(port)
  })

  return app
}
