import http from 'node:http'
import sirv from 'sirv'
import { Rpc } from './rpc'

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

  // createWebSocketServer(server)
  const rpc = new Rpc(server)

  rpc.send({
    method: 'init',
    params: {
      port: 3000,
    },
  })

  server.listen(3000)
}
