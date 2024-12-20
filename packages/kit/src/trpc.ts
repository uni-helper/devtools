import process from 'node:process'
import {
  createTRPCProxyClient,
  createWSClient,
  wsLink,
} from '@trpc/client'
import ws from 'ws'

function isNodeEnvironment() {
  return typeof process !== 'undefined' && process.versions != null && process.versions.node != null
}

export function createTrpc() {
  if (isNodeEnvironment()) {
    const port = process.env.UNI_DEVTOOLS_PORT
    const wsClient = createWSClient({
      url: `ws://localhost:${port}/trpc`,
      WebSocket: ws as unknown as typeof WebSocket,
    })
    return createTRPCProxyClient({
      links: [
        wsLink({ client: wsClient }),
      ],
    })
  }
  else {
    // @ts-expect-error runtime only
    return uni.$trpc
  }
}
