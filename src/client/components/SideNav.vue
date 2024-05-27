<script setup lang="ts">
import { VueDropdown } from '@vue/devtools-ui'
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
        </button>
      <!-- <template #popper>
        <DockingPanel />
      </template> -->
      </VueDropdown>
    </div>
  </div>
</template>
