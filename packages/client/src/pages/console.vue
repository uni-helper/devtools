<script setup lang="ts">
import type { ConsoleInfo } from '@uni-helper/devtools'
import { parse } from 'flatted'

const logList = ref<ConsoleInfo[]>([])

trpc.onConsole.subscribe(undefined, {
  onData: (data) => {
    data.forEach((item) => {
      console.log(parse(item.messages))

      logList.value.push(item)
    })
  },
})
</script>

<template>
  <PanelGrids class="drawer-container" relative block h-full of-hidden>
    <div h-full w-full of-auto>
      <template v-for="(co, index) in logList" :key="index">
        <template v-for="(item, i) in parse(co.messages)" :key="i">
          <StateFields
            v-if="typeof item === 'object'"
            :id="i"
            :data="{
              key: Object.keys(item).join(','),
              value: item,
            }"
          />
          <p v-else>
            {{ item }}
          </p>
        </template>
      </template>
    </div>
  </PanelGrids>
</template>
