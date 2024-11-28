<script setup lang="ts">
import type { ComponentTreeNode } from '@uni-helper/devtools-types'

const filterName = ref('')

const data = ref<ComponentTreeNode[]>()
trpc.onComponentTree.subscribe(undefined, {
  onData: (value) => {
    data.value = [value]
  },
})
</script>

<template>
  <PanelGrids block h-screen of-auto>
    <Navbar v-model:search="filterName" :no-padding="true" />
    <div no-scrollbar flex-1 select-none overflow-hidden px2>
      <TreeViewer :data="data!" :with-tag="true" :depth="0" />
    </div>
  </PanelGrids>
</template>
