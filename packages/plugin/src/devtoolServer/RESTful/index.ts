import type { EventEmitter } from 'node:stream'
import type polka from 'polka'

export function setupUserRoutes(
  app: polka.Polka,
  eventEmitter: EventEmitter,
) {
  app.post('/api/log', (req, res) => {
    console.log('Received data:', req.body)
    eventEmitter.emit('log', req.body)
    res.end(JSON.stringify({ status: 'success' }))
  })
}
