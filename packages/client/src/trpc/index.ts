import {
  createTRPCProxyClient,
  createWSClient,
  httpBatchLink,
  splitLink,
  wsLink,
} from '@trpc/client'
import type { AppRouter } from '@uni-helper/devtools'

const currentUrl = window.location
const wsUrl = `${(currentUrl.protocol === 'https:' ? 'wss://' : 'ws://') + currentUrl.host}/trpc`
export const trpc = createTRPCProxyClient<AppRouter>({
  links: [
    splitLink({
      condition: (op) => {
        return op.type === 'subscription'
      },
      true: wsLink({
        client: createWSClient({
          url: wsUrl,
        }),
      }),
      false: httpBatchLink({
        url: '/trpc',
      }),
    }),
  ],
})
