import { createTRPCProxyClient, httpBatchLink } from '@trpc/client'
import type { AppRouter } from '@uni-helper/devtools'

export const trpc = createTRPCProxyClient<AppRouter>({
  links: [
    httpBatchLink({
      url: '/trpc',
    }),
  ],
})
