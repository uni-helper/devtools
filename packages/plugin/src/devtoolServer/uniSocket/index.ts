import type { createServer } from 'node:http'
import ws from 'ws'

export function createUniSocketServer(server: ReturnType<typeof createServer>) {
  const uniWss = new ws.Server({ noServer: true })

  uniWss.on('connection', (ws) => {
    console.log('uniSocket connected')

    ws.on('close', () => {
      console.log('uniSocket disconnected')
    })
    ws.on('error', (err) => {
      console.error('uniSocket error', err)
    })
    ws.on('message', (message) => {
      console.log('uniSocket message', message)
    })
    ws.on('open', () => {
      console.log('uniSocket open')
    })
  })

  server.on('upgrade', (request, socket, head) => {
    const pathName = new URL(request.url, `http://${request.headers.host}`).pathname
    console.log('uniSocket upgrade', pathName)
    if (pathName === '/uni') {
      uniWss.handleUpgrade(request, socket, head, (ws) => {
        uniWss.emit('connection', ws, request)
      })
    }
  })
}
