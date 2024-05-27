import polka from 'polka'
import sirv from 'sirv'

export function createDevtoolServe(path: string) {
  const serve = sirv(path, {
    dev: true,
  })

  const app = polka()

  app.use(serve)
  app.listen(3000)

  return app
}
