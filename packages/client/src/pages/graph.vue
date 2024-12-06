<script setup lang="ts">
import { Network } from 'vis-network'

async function fetchGraph() {
  const root = await trpc.getRoot.query()
  const module = await trpc.getModules.query()
  parseGraphRawData(module, root)
}
await fetchGraph()
const container = ref<HTMLDivElement>()
const networkRef = shallowRef<Network>()

function mountNetwork() {
  const node = container.value!

  const network = networkRef.value = new Network(node, { nodes: graphNodes, edges: graphEdges }, graphOptions.value)

  watch(graphOptions, (options) => {
    network.setOptions(options)
  }, { immediate: true })

  network.on('selectNode', (options) => {
    updateGraphDrawerData(options.nodes[0])
    toggleGraphDrawer(true)
  })

  network.on('deselectNode', () => {
    toggleGraphDrawer(false)
  })

  watch(() => graphFilterNodeId.value, (id) => {
    if (id)
      network.moveTo({ position: { x: 0, y: 0 } })
  })
}

onMounted(() => {
  mountNetwork()
})

onUnmounted(() => {
  cleanupGraphRelatedStates()
  networkRef.value?.destroy()
})

const navbarRef = ref<HTMLElement>()
</script>

<template>
  <div flex="~ col" relative h-full of-hidden panel-grids class="graph-body">
    <GraphNavbar ref="navbarRef" />
    <div ref="container" class="absolute h-full w-full" />
    <GraphFileType />
    <GraphDrawer :top="navbarRef" />
  </div>
</template>
