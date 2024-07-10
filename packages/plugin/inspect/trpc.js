import {
  createTRPCProxyClient,
  createWSClient,
  wsLink,
} from '@uni-helper/trpc-client'

// @ts-ignore
const port = __UNI_DEVTOOLS_PORT__

const wsClient = createWSClient({
  url: `ws://localhost:${port}/trpc`,
})

/**
 * @type {import("@uni-helper/trpc-client").CreateTRPCProxyClient<import("./../src/index").AppRouter>}
 */
export const trpc = createTRPCProxyClient({
  links: [
    wsLink({ client: wsClient }),
  ],
})
