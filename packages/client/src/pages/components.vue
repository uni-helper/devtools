<script setup lang="ts">
import { VueInput } from '@vue/devtools-ui'

const { initState } = useInitState()

const filterName = ref('')
const [filtered, _toggleFiltered] = useToggle(true)
</script>

<template>
  <PanelGrids block h-screen of-auto>
    <div w-full flex gap2 p2>
      <VueInput
        v-model="filterName"
        :loading-debounce-time="250"
        :loading="!filtered"
        placeholder="Find components..."
        flex-1
      />
    </div>
    <div no-scrollbar flex-1 select-none overflow-hidden px2>
      <ComponentTreeNode :data="initState!.components" />
    </div>
  </PanelGrids>
</template>
