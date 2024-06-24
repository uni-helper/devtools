<script setup lang="ts">
import { VueDrawer } from '@vue/devtools-ui'

const { initState } = useInitState()
const piniaState = initState.value!.piniaState
const piniaStores = ref([
  {
    id: '__pinia_root',
    label: '🍍 Pinia (root)',
    value: piniaState,
  },
])

for (const [id, store] of Object.entries(piniaState)) {
  piniaStores.value.push({
    id,
    label: id,
    value: store,
  })
}

const activeIndex = ref('')
const selected = ref(false)
function select(index: string) {
  activeIndex.value = index
  selected.value = true
}
</script>

<template>
  <PanelGrids class="drawer-container" relative block h-full of-hidden>
    <div px2>
      <div
        v-for="item in piniaStores" :key="item.id"
        selectable-item
        :class="{ active: activeIndex === item.id }"
        @click="select(item.id)"
      >
        <span class="selectable-item-label">
          {{ item.label }}
        </span>
      </div>
    </div>
    <VueDrawer
      v-model="selected"
      permanent mount-to=".drawer-container"
      content-class="text-sm b-l-0 w-full"
      position="absolute"
    >
      <div>
        {{ piniaStores.find((item) => item.id === activeIndex)?.value }}
      </div>
    </VueDrawer>
  </PanelGrids>
</template>
