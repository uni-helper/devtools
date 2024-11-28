<script setup lang="ts">
import type { ComponentTreeNode } from '@uni-helper/devtools-types'

let data: ComponentTreeNode[] = []
const tree = ref<ComponentTreeNode[]>([])
trpc.onComponentTree.subscribe(undefined, {
  onData: (value) => {
    data = [value]
    tree.value = [value]
  },
})

const [filtered, toggleFiltered] = useToggle(true)
function searchNode(node: ComponentTreeNode, searchTerm: string): ComponentTreeNode | null {
  const name = node.name.toLowerCase()
  const hasMatch = name.includes(searchTerm)

  if (node.children) {
    const filteredChildren: ComponentTreeNode[] = []
    for (const child of node.children) {
      const result = searchNode(child, searchTerm)
      if (result) {
        filteredChildren.push(result)
      }
    }

    if (filteredChildren.length > 0 || hasMatch) {
      return { ...node, children: filteredChildren }
    }
  }

  return hasMatch ? node : null
}
function getComponentsInspectorTree(searchTerm: string) {
  searchTerm = searchTerm.toLowerCase().trim()
  if (!searchTerm) {
    tree.value = data
    return
  }

  const result: ComponentTreeNode[] = []
  for (const node of data) {
    const foundNode = searchNode(node, searchTerm)
    if (foundNode) {
      result.push(foundNode)
    }
  }

  // return result
  tree.value = result
}

function searchComponentTree(v: string) {
  const value = v.trim().toLowerCase()
  toggleFiltered()
  getComponentsInspectorTree(value)
  toggleFiltered()
}

const filterComponentName = ref('')
watchDebounced(filterComponentName, (v) => {
  searchComponentTree(v)
}, { debounce: 300 })
</script>

<template>
  <PanelGrids block h-screen of-auto>
    <Navbar v-model:search="filterComponentName" :no-padding="true" :loading="!filtered" />

    <div no-scrollbar flex-1 select-none overflow-hidden px2>
      <TreeViewer :data="tree" :with-tag="true" :depth="0" />
    </div>
  </PanelGrids>
</template>
