<script setup lang="ts">
import type { ComponentTreeNode } from '@uni-helper/devtools-types'
import { computed, ref } from 'vue'
import { Pane, Splitpanes } from 'splitpanes'
import { VueInput } from '@vue/devtools-ui'

let data: ComponentTreeNode[] = []
const tree = ref<ComponentTreeNode[]>([])
trpc.onComponentTree.subscribe(undefined, {
  onData: (value) => {
    data = [value]
    tree.value = [value]
  },
})

function handleDateById(id: number) {
  console.log(id)
  trpc.onComponentData.subscribe(id, {
    onData: (value) => {
      console.log(value)
    },
  })
}

const filterComponentName = ref('')
const searchTerm = computed(() => filterComponentName.value.trim().toLowerCase())

// 使用计算属性来自动更新搜索结果，提高效率
const filteredTree = computed(() => {
  if (!searchTerm.value) {
    return data
  }
  return filterTree(data, searchTerm.value)
})

function filterTree(data: ComponentTreeNode[], searchTerm: string): ComponentTreeNode[] {
  const result: ComponentTreeNode[] = []
  for (const node of data) {
    const foundNode = searchNode(node, searchTerm)
    if (foundNode) {
      result.push(foundNode)
    }
  }
  return result
}

function searchNode(node: ComponentTreeNode, searchTerm: string): ComponentTreeNode | null {
  const name = node.name.toLowerCase()
  const hasMatch = name.includes(searchTerm)
  const filteredChildren = node.children?.map(child => searchNode(child, searchTerm)).filter(Boolean) || []

  if (filteredChildren.length > 0 || hasMatch) {
    return { ...node, children: filteredChildren as ComponentTreeNode[] }
  }
  return null
}

// 使用watchDebounced来处理输入，减少不必要的计算和更新
watchDebounced(
  searchTerm,
  () => {
    tree.value = filteredTree.value
  },
  { debounce: 300 },
)

const filterStateKey = ref('')
</script>

<template>
  <PanelGrids block h-screen of-auto>
    <Splitpanes class="flex-1 overflow-auto">
      <Pane border="r base" size="40" h-full>
        <div class="p2">
          <div class="grid grid-cols-[1fr_auto] mb1 items-center gap2 pb1" border="b dashed base">
            <VueInput v-model="filterComponentName" placeholder="filter component name" />
          </div>

          <div no-scrollbar flex-1 select-none overflow-hidden px2>
            <TreeViewer :data="tree" :with-tag="true" :depth="0" @change="handleDateById" />
          </div>
        </div>
      </Pane>
      <Pane size="60">
        <div class="h-full flex flex-col p2">
          <div class="grid grid-cols-[1fr_auto] mb1 items-center gap2 pb1" border="b dashed base">
            <VueInput v-model="filterStateKey" placeholder="filter Pinia state" />
          </div>
          <!-- <RootStateViewer
            v-if="!emptyState"
            class="no-scrollbar flex-1 overflow-scroll"
            :data="displayState"
            :node-id="piniaRootLabel[0].id"
            inspector-id="pinia"
            expanded-state-id="pinia-store-state"
          /> -->
          <Empty>
            No Data
          </Empty>
        </div>
      </Pane>
    </Splitpanes>
  </PanelGrids>
</template>
