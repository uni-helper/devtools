<script setup lang="ts">
import { VueInput } from '@vue/devtools-ui'
// import type { RouteLocationNormalizedLoaded, RouteRecordNormalized } from 'vue-router'
import PanelGrids from '../components/common/PanelGrids.vue'
import SectionBlock from '../components/common/SectionBlock.vue'
import { usePagesState } from './../stores/pages'

const params = new URLSearchParams(window.location.search)
const currentPage = params.get('from')
const routeInput = ref(currentPage)
const { pageCount, getPages, pagesState } = usePagesState()
await getPages()
// const currentRoute = ref<RouteLocationNormalizedLoaded | null>(null)
// const matchedRoutes = ref<RouteRecordNormalized[]>([])
// const routeInputMatched = computed(() => {
//   if (routeInput.value === currentRoute.value?.path)
//     return []
//   else
//     return matchedRoutes.value
// })
// function navigate() {
//   if (routeInputMatched.value.length)
//     navigateToRoute(routeInput.value)
// }

// function navigateToRoute(path: string) {
//   console.log(path)
// }
</script>

<template>
  <PanelGrids block h-screen of-auto>
    <div h-full of-auto>
      <div border="b base" flex="~ col gap1" px4 py3>
        <div>
          <template v-if="false">
            <span op50>Navigate from </span>
            <span font-mono>Hi</span>
            <span op50> to </span>
          </template>
          <template v-else>
            <span op50>Current route</span>
          </template>
        </div>
        <VueInput
          v-model="routeInput"
          left-icon="i-carbon-direction-right-01 scale-y--100"
          class="text-green!"
        />
      </div>
      <SectionBlock
        icon="i-carbon-tree-view-alt"
        text="All Routes"
        :description="`${pageCount} routes registered in your application`"
        :padding="false"
      >
        <RoutesTable
          :pages="pagesState"
          :matched="currentRoute?.matched ?? []"
          :matched-pending="routeInputMatched"
          @navigate="navigateToRoute"
        />
      </SectionBlock>
    </div>
  </PanelGrids>
</template>
