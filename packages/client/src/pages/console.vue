<script setup lang="ts">
import type { ConsoleInfo } from '@uni-helper/devtools'
import { VueCheckbox, VueSelect } from '@vue/devtools-ui'
import { parse } from '@ungap/structured-clone/json'

const consoleList = ref<ConsoleInfo[]>([])
const uniqConsoleTypes = ref<{ label: string, value: string }[]>([])
trpc.onConsole.subscribe(undefined, {
  onData: (data) => {
    consoleList.value.push({
      ...data,
      messages: parse(data.messages),
    })
    console.log(consoleList.value)
    const hastype = uniqConsoleTypes.value.find(type => type.value === data.type)
    if (!hastype)
      uniqConsoleTypes.value.push({ label: data.type, value: data.type })
  },
})
const filteredConsoles = ref(consoleList.value.map(i => i.type))
function clearConsoleList() {
  consoleList.value = []
}
function colorByType(data: ConsoleInfo['type']) {
  const colorMap = {
    warn: 'bg-#413C27',
    error: 'bg-#4F3634',
    log: 'bg-#2C2C2C',
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

      <div mx-0.83rem>
        <div
          v-for="(consoleInfo, key) in consoleList" :key
          mb0.5 flex cursor-default items-center justify-between rounded hover:op85
          :class="colorByType(consoleInfo.type)"
        >
          <div v-for="(data, index) in consoleInfo.messages" :key="index" truncate>
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
