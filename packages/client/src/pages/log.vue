<script setup lang="ts">
const logList = ref<string[]>([])

trpc.onLog.subscribe(undefined, {
  onData: (data) => {
    logList.value.push(data)
  },
})
</script>

<template>
  <!-- <div v-for="item in logList" :key="">
    <slot />
  </div> -->
  {{ logList }}
</template>
