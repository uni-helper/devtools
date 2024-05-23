import http from 'node:http'
import sirv from 'sirv'
import WebSocket from 'ws'

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

  const wss = new WebSocket.Server({ server })

  wss.on('connection', (ws) => {
    // 当有客户端连接时，发送一条消息
    ws.send('Hello! Message from the server.')

    // 你可以在这里监听客户端发来的消息
    ws.on('message', (message) => {
      console.log('received: %s', message)
    })
  })

  server.listen(3000)
}
