<script setup lang="ts">
import { VueInput } from '@vue/devtools-ui'
import type { RouteLocationNormalizedLoaded, RouteRecordNormalized } from 'vue-router'
import PanelGrids from '../components/common/PanelGrids.vue'

const routeInput = ref('')
const currentRoute = ref<RouteLocationNormalizedLoaded | null>(null)
const matchedRoutes = ref<RouteRecordNormalized[]>([])
const routeInputMatched = computed(() => {
  if (routeInput.value === currentRoute.value?.path)
    return []
  else
    return matchedRoutes.value
})
function navigate() {
  if (routeInputMatched.value.length)
    navigateToRoute(routeInput.value)
}

function navigateToRoute(path: string) {
  console.log(path)
}
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
          :class="currentRoute?.path === routeInput ? '' : routeInputMatched.length ? 'text-green!' : 'text-orange!'"
          @keydown.enter="navigate"
        />
      </div>
    </div>
  </PanelGrids>
</template>
