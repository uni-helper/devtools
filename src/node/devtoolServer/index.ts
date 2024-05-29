import polka from 'polka'
import sirv from 'sirv'
import { DIR_CLIENT, DIR_TMP_INSPECT } from '../dir'

export function createDevtoolServe(port: number) {
  const clientServe = sirv(DIR_CLIENT)
  const inspectServe = sirv(DIR_TMP_INSPECT)

  const app = polka()

  app.use(clientServe)

  app.use('/inspect', inspectServe)
  app.listen(port)

  return app
}
