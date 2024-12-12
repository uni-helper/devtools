import {
  createTRPCProxyClient,
  createWSClient,
  wsLink,
} from '@trpc/client'
import { UniWebSocket } from '@uni-helper/devtools-shared'

// @ts-ignore
const port = __UNI_DEVTOOLS_PORT__

const wsClient = createWSClient({
  url: `ws://localhost:${port}/trpc`,
  // @ts-ignore
  WebSocket: UniWebSocket,
})

/**
 * @type {import("@trpc/client").CreateTRPCProxyClient<import("./../src/index").AppRouter>}
 */
export const trpc = createTRPCProxyClient({
  links: [
    wsLink({ client: wsClient }),
  ],
})
