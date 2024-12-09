import { createServer } from 'node:http'
import { createApp, toNodeListener } from 'h3'
import { createBirpc } from 'birpc'

const serverFunctions = {
  hi(name: string) {
    return `Hi ${name} from server`
  },
}
export function createDevtoolServe() {
  const app = createApp()

  const httpServer = createServer(toNodeListener(app))
  const io = new Server(httpServer, {
    cors: {
      origin: true,
    },
  })
  io.on('connection', async (socket) => {
    console.log('socket connected', socket.id)
    const rpc = createBirpc(
      serverFunctions,
      {
        post: data => socket.emit(data),
        on: fn => socket.on('data', fn),
        serialize: v => JSON.stringify(v),
        deserialize: v => JSON.parse(v),
      },
    )
    await rpc.hey('Server')
  })

  httpServer.listen(8090, () => {
    console.log(`listening on 0.0.0.0:${8090}`)
  })
}
createDevtoolServe()
