<script setup lang="ts">
import { VueInput } from '@vue/devtools-ui'

const filterName = ref('')
const [filtered, toggleFiltered] = useToggle(true)

const treeNode = {
  name: 'App',
  children: [
    {
      name: 'HelloWorld',
      children: [
        {
          name: 'World',
        },
      ],
    },
  ],
}
</script>

<template>
  <PanelGrids h-screen>
    <div w-full flex gap2 px2 py2>
      <VueInput
        v-model="filterName"
        :loading-debounce-time="250"
        :loading="!filtered"
        placeholder="搜索组件..."
        flex-1
      />
    </div>
    <div h-screen select-none overflow-scroll p-2 class="no-scrollbar">
      <ComponentTreeNode
        v-for="item in treeNode"
        :key="item.name"
        :data="item"
      />
    </div>
  </PanelGrids>
</template>
