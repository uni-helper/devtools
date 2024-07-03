<script setup lang="ts">
const { initState } = useInitState()

const filterName = ref('')
trpc.onUpdate.subscribe('test', {
  onData: (data) => {
    console.log('onData', data)
  },
  onStarted() {
    console.log('onStarted')
  },
})
async function handleClick() {
  await trpc.update.mutate('123123')
}
</script>

<template>
  <PanelGrids block h-screen of-auto @click="handleClick">
    <Navbar v-model:search="filterName" :no-padding="true" />
    <div no-scrollbar flex-1 select-none overflow-hidden px2>
      <ComponentTreeNode :data="initState!.components" />
    </div>
  </PanelGrids>
</template>
