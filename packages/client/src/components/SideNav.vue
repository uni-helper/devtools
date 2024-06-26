<script setup lang="ts">
import { VueDropdown } from '@vue/devtools-ui'
import Logo from '/icon.png'
import type { Tab } from '~/constants/tab'

async function handleClick() {
  await trpc.openInBrowser.query(window.location.href)
}
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
          <img :src="Logo" h-6 w-6>
          <!-- <img :src="Icon" alt=""> -->
        </button>
        <template #popper>
          <div @click="handleClick">
            在浏览器打开
          </div>
        </template>
      </VueDropdown>
    </div>
    <div flex="~ auto col gap-0.5 items-center" w-full of-x-hidden of-y-auto p1 class="no-scrollbar">
      <template v-for="[name, tabs], idx of builtinTab" :key="name">
        <div v-if="idx" my1 h-1px w-8 border="b base" />
        <SideNavItem
          v-for="(tab, key) of (tabs as Tab[])"
          :key
          :tab="tab"
        />
      </template>
      <div flex-auto />
    </div>
  </div>
</template>
