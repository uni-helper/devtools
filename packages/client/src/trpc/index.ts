import { createTRPCProxyClient, httpBatchLink } from '@trpc/client'
import type { AppRouter } from '@uni-helper/devtools'

const trpc = createTRPCProxyClient<AppRouter>({
  links: [
    httpBatchLink({
      url: '/trpc',
    }),
  ],
})

export async function testTrpc() {
  const users = await trpc.getPages.query()
  console.log(users)
}
