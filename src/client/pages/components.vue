<script setup lang="ts">
import { VueInput } from '@vue/devtools-ui'
import { useInitState } from './../stores/init'
import ComponentTreeNode from './../components/components/ComponentTreeNode.vue'

const { initState } = useInitState()

const filterName = ref('')
const [filtered] = useToggle(true)
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
        v-for="item in initState!.components"
        :key="item.name"
        :data="item"
      />
    </div>
  </PanelGrids>
</template>
