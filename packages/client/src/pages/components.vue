<script setup lang="ts">
const { initState } = useInitState()

const filterName = ref('')
</script>

<template>
  <PanelGrids block h-screen of-auto>
    <Navbar v-model:search="filterName" :no-padding="true" />
    <div no-scrollbar flex-1 select-none overflow-hidden px2>
      <ComponentTreeNode :data="initState!.components" />
    </div>
  </PanelGrids>
</template>
