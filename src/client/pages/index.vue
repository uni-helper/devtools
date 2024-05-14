<script setup lang="ts" generic="T extends any, O extends any">
import { createBirpc } from 'birpc'

const ws = new WebSocket('ws://localhost:3000')

const clientFunctions = {
  hey(name: string) {
    return `Hey ${name} from client`
  },
}

const rpc = createBirpc(
  clientFunctions,
  {
    post: data => ws.send(data),
    on: data => ws.onmessage('message', data),
    // these are required when using WebSocket
    serialize: v => JSON.stringify(v),
    deserialize: v => JSON.parse(v),
  },
)

onMounted(async () => {
  // call server function
  const result = await rpc.hey('Client')
  console.log(result) // Hey Client from server
})
</script>

<template>
  <div>
    {{ createHotContext('/___', `${location.pathname.split('/__devtools')[0] || ''}/`.replace(/\/\//g, '/')) }}
  </div>
</template>
