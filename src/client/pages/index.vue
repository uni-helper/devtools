<script setup lang="ts">
const socket = new WebSocket('ws://localhost:3000')

socket.addEventListener('open', (event) => {
  socket.send('Hello Server!')
})

socket.addEventListener('message', (event) => {
  console.log('Message from server ', event.data)
})
</script>

<template>
  <div>
    index
  </div>
</template>
