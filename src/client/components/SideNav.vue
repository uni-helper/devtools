<script setup lang="ts">
import { VueDropdown } from '@vue/devtools-ui'
import { useCategorizedTabs } from '../composables/tab'
import SideNavItem from './SideNavItem.vue'
// import Icon from '/icon.png'

const categories = useCategorizedTabs()
</script>

<template>
  <div
    border="r base" flex="~ col items-start"
    class="$ui-z-max-override" h-full of-hidden bg-base
  >
    <div
      sticky top-0 z-1 w-full p1 bg-base border="b base"
    >
      <VueDropdown placement="left-start" :distance="6" :skidding="5" trigger="click" class="w-full">
        <button
          flex="~ items-center justify-center gap-2"
          hover="bg-active"
          text-secondary relative h-10 w-full select-none p2
          exact-active-class="!text-primary bg-active"
          class="rounded-xl"
        >
          <div i-logos-vue h-6 w-6 />
          <!-- <img :src="Icon" alt=""> -->
        </button>
      <!-- <template #popper>
        <DockingPanel />
      </template> -->
      </VueDropdown>
    </div>
    <div flex="~ auto col gap-0.5 items-center" w-full of-x-hidden of-y-auto p1 class="no-scrollbar">
      <template v-for="[name, tabs], idx of categories" :key="name">
        <template v-if="tabs.length">
          <div v-if="idx" my1 h-1px w-8 border="b base" />
          <SideNavItem
            v-for="tab of tabs"
            :key="tab.path"
            :tab="tab"
          />
        </template>
      </template>
      <div flex-auto />
    </div>
  </div>
</template>
