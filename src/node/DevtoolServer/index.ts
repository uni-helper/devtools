import polka from 'polka'
import sirv from 'sirv'

export function createDevtoolServe(path: string, port: number) {
  const serve = sirv(path, {
    dev: true,
  })

  const app = polka()

  app.use(serve)
  app.listen(port)

  return app
}
