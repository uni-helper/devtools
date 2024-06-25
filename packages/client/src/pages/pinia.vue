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
const data = computed(() => {
  const store = piniaStores.value.find(item => item.id === activeIndex.value)!
  return [
    {
      key: 'State',
      value: store.value,
    },
  ]
})
function select(index: string) {
  activeIndex.value = index
  selected.value = true
  // data.value = [{
  //   key: 'State',
  //   value: piniaStores.value.find(item => item.id === index)!.value,
  // }]
}

// const data = ref([
//   {
//     key: 'state',
//     value: piniaState,
//   },
// ])
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
      <div h-screen select-none overflow-scroll p-2 class="no-scrollbar">
        <StateFields v-for="(item, index) in data" :id="index" :key="index" :data="item" />
      </div>
    </VueDrawer>
  </PanelGrids>
</template>
