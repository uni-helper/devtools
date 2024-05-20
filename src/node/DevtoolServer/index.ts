import http from 'node:http'
import sirv from 'sirv'

export function createDevtoolServe(path: string) {
  const serve = sirv(path, {
    single: true,
    dev: true,
  })

  const server = http.createServer((req, res) => {
    serve(req, res, () => {
      res.statusCode = 404
      res.end('Not found')
    })
  })

  server.listen(3000, () => {
    console.log('Server listening on http://localhost:3000')
  })
}
