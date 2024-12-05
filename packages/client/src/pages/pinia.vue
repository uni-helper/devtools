<script setup lang="ts">
import { VueInput } from '@vue/devtools-ui'
import type { CustomInspectorNode, CustomInspectorState } from '@vue/devtools-kit'
import { parse } from '@vue/devtools-kit'
import { Pane, Splitpanes } from 'splitpanes'
import { filterInspectorState } from '~/utils/search'
import ComponentTree from '~/components/tree/TreeViewer.vue'

const state = ref<Record<string, CustomInspectorState[]>>({})
const tree = ref<CustomInspectorNode[]>([])
const selectId = ref('')
// const emptyState = computed(() => true)

const piniaRootLabel = [
  {
    id: '__pinia_root',
    label: '🍍 Pinia (root)',
  },
]

trpc.onPiniaState.subscribe(undefined, {
  onData: (data) => {
    const _state = data.map(item => parse(item))
    state.value = {
      state: _state,
    }
    tree.value = piniaRootLabel.concat(_state.map((item) => {
      const key = item.key
      return {
        id: key,
        label: key,
      }
    }))
  },
})

// 搜索store
const filterStoreKey = ref('')
const filterTree = computed(() => {
  if (!filterStoreKey.value)
    return tree.value
  return tree.value.filter(item => item.label.toLowerCase().includes(filterStoreKey.value.toLowerCase()))
})

const filterStateKey = ref('')
const selectData = computed(() => {
  console.log(selectId.value)
  if (!selectId.value)
    return state.value
  return {
    state: state.value.state?.find(item => (item.key as unknown as string) === selectId.value),
  }
})
const emptyState = computed(() => !selectData.value.state?.length)

const displayState = computed(() => {
  const state = selectData.value
  return filterInspectorState({
    state,
    filterKey: filterStateKey.value,
  })
})
</script>

<template>
  <PanelGrids class="drawer-container" relative block h-full of-hidden>
    <Splitpanes class="flex-1 overflow-auto">
      <Pane border="r base" size="40" h-full>
        <div class="h-full flex flex-col p2">
          <div class="grid grid-cols-[1fr_auto] mb1 items-center gap2 pb1" border="b dashed base">
            <VueInput v-model="filterStoreKey" placeholder="filter Pinia store" />
          </div>
          <div class="no-scrollbar flex-1 select-none overflow-scroll">
            <ComponentTree :data="filterTree" @change="(id) => selectId = id" />
          </div>
        </div>
      </Pane>
      <Pane size="60">
        <div class="h-full flex flex-col p2">
          <div class="grid grid-cols-[1fr_auto] mb1 items-center gap2 pb1" border="b dashed base">
            <VueInput v-model="filterStateKey" placeholder="filter Pinia state" />
          </div>
          <RootStateViewer v-if="!emptyState" class="no-scrollbar flex-1 overflow-scroll" :data="displayState" :node-id="piniaRootLabel[0].id" inspector-id="pinia" expanded-state-id="pinia-store-state" />
          <Empty v-else>
            No Data
          </Empty>
        </div>
      </Pane>
    </Splitpanes>
  </PanelGrids>
</template>
