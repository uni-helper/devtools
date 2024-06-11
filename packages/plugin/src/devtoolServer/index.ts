import polka from 'polka'
import sirv from 'sirv'
import { DIR_CLIENT, DIR_TMP_INSPECT } from '../dir'

export function createDevtoolServe(port: number) {
  console.log(DIR_CLIENT)
  const clientServe = sirv(DIR_CLIENT, { dev: true })
  const inspectServe = sirv(DIR_TMP_INSPECT, { dev: true })

  const app = polka()

  app.use('/inspect', inspectServe)
  app.use(clientServe)

  app.listen(port)

  return app
}
