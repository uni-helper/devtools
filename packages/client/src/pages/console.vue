<script setup lang="ts">
import type { ConsoleInfo } from '@uni-helper/devtools'
import { parse } from 'flatted'

const logList = ref<ConsoleInfo[]>([])

trpc.onConsole.subscribe(undefined, {
  onData: (data) => {
    data.forEach((item) => {
      logList.value.push(item)
    })
  },
})
</script>

<template>
  <StateFields
    v-for="(co, index) in logList"
    :id="index"
    :key="index"
    :data="{
      key: co.type,
      value: parse(co.messages),
    }"
  />
</template>
