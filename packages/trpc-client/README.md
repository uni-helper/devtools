<p align="center">
  <a href="https://trpc.io/"><img src="https://assets.trpc.io/icons/svgs/blue-bg-rounded.svg" alt="tRPC" height="75"/></a>
<a href="https://github.com/uni-helper"><img src="https://avatars.githubusercontent.com/u/117957276?s=200&v=4" alt="tRPC" height="75"/></a>

</p>

<h3 align="center">tRPC x uni-app</h3>

<p align="center">
  <strong>End-to-end typesafe APIs made easy</strong>
</p>

<p align="center">
  <img src="https://assets.trpc.io/www/v10/v10-dark-landscape.gif" alt="Demo" />
</p>

# `@uni-helper/trpc-client`

> 兼容uni-app的trpc客户端.

## Documentation

查阅`@trpc/clinrt`的完整文档，请访问[这里](https://trpc.io/docs/vanilla)。

## Installation

```bash
# npm
npm install @uni-helper/trpc-client

# Yarn
yarn add @uni-helper/trpc-client

# pnpm
pnpm add @uni-helper/trpc-client

# Bun
bun add @uni-helper/trpc-client
```

## Basic Example

```ts
import { createTRPCClient, httpBatchLink } from '@uni-helper/trpc-client'
// Importing the router type from the server file
import type { AppRouter } from './server'

// Initializing the tRPC client
const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: 'http://localhost:3000/trpc',
    }),
  ],
})

async function main() {
  // Querying the greeting
  const helloResponse = await trpc.greeting.query({
    name: 'world',
  })

  console.log('helloResponse', helloResponse) // Hello world
}

main()
```
