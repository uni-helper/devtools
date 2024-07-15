<script setup lang="ts">
import type { ConsoleInfo } from '@uni-helper/devtools'
import { parse } from 'flatted'
import { VueCheckbox, VueSelect } from '@vue/devtools-ui'

const consoleList = ref<ConsoleInfo[]>([])
const uniqConsoleTypes = ref<{ label: string, value: string }[]>([])
trpc.onConsole.subscribe(undefined, {
  onData: (data) => {
    data.forEach((item) => {
      consoleList.value.push({
        ...item,
        messages: parse(item.messages),
      })
      const hastype = uniqConsoleTypes.value.find(type => type.value === item.type)
      if (!hastype)
        uniqConsoleTypes.value.push({ label: item.type, value: item.type })
    })
  },
})
const filteredConsoles = ref(consoleList.value.map(i => i.type))
function clearConsoleList() {
  consoleList.value = []
}
function colorByType(data: ConsoleInfo['type']) {
  const colorMap = {
    log: '',
    warn: 'bg-#413C27',
    error: 'bg-#4F3634',
  }
  return colorMap[data] || ''
}
</script>

<template>
  <PanelGrids class="drawer-container" relative block h-full of-hidden>
    <div h-full w-full of-auto>
      <Navbar class="p-0.83rem!">
        <template #actions>
          <VueSelect v-model="filteredConsoles" :multiple="true" :options="uniqConsoleTypes">
            <template #button>
              <IconTitle
                v-tooltip.bottom-end="'Filter'"
                icon="i-carbon-filter hover:op50" :border="false"
                title="Filter" relative cursor-pointer text-lg
                @click="() => { }"
              />
            </template>
            <template
              #item="{
                item, active,
              }"
            >
              <div
                w-full flex="~ gap-2 items-center" rounded px2 py2
              >
                <VueCheckbox :model-value="active" />
                <span text-xs op75>{{ item.label }}</span>
              </div>
            </template>
          </VueSelect>
          <IconTitle
            icon="i-tabler:ban hover:op50" :border="false"
            relative
            cursor-pointer text-lg @click="clearConsoleList"
          />
        </template>
      </Navbar>

      <div m-0.83rem>
        <div
          v-for="(consoleInfo, key) in consoleList" :key
          mb0.5 flex items-center justify-between rounded
          hover:bg-active
          :class="colorByType(consoleInfo.type)"
        >
          <div v-for="(data, index) in consoleInfo.messages" :key="index">
            <RootStateViewer :data />
          </div>
          <span
            mr1rem cursor-pointer text-sm text-gray font-300
            :class="{ 'hover:underline': consoleInfo.file !== 'node_modules' }"
            @click="openInEditor(consoleInfo.file)"
          >
            {{ consoleInfo.file }}
          </span>
        </div>
      </div>
    </div>
  </PanelGrids>
</template>
