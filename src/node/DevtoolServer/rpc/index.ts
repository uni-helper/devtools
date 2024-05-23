import type { Server } from 'node:http'
import WebSocket from 'ws'

export class Rpc {
  private wss: WebSocket.Server
  private messageQueue: string[]

  constructor(server: Server) {
    this.wss = new WebSocket.Server({ server })
    this.messageQueue = []

    this.wss.on('connection', (ws) => {
      this.handleConnection(ws)
    })
  }

  handleConnection(ws: WebSocket) {
    // 当客户端连接时，发送队列中的所有消息
    this.messageQueue.forEach((message) => {
      ws.send(message)
    })
  }

  send(message: Record<string, any>) {
    const _message = JSON.stringify(message)
    // 如果没有客户端连接，将消息添加到队列中
    this.messageQueue.push(_message)
    // 否则，向所有打开状态的客户端发送消息
    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN)
        client.send(_message)
    })
  }
}
