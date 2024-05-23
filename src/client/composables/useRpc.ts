export function useRpc() {
  const socket = new WebSocket('ws://localhost:3000')
  const data = ref()
  socket.addEventListener('message', (event) => {
    console.log('event', event)
    data.value = {
      ...data.value,
      ...JSON.parse(event.data),
    }
  })
  console.log('data', data.value)
  return computed(() => data.value)
}
