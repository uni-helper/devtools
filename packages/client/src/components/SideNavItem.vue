<script setup lang="ts">
import type { Tab } from '~/constants/tab'

const props = defineProps<{
  tab: Tab
}>()

function onClick() {
  devtoolsClientState.value.route = props.tab.path
}
</script>

<template>
  <VTooltip placement="right">
    <Component
      :is="tab.path ? 'RouterLink' : 'button'"
      :to="tab.path"
      flex="~"
      hover="bg-active"
      text-secondary h-10 w-10 select-none items-center justify-center rounded-xl p1
      exact-active-class="!text-primary bg-active c-primary-600"
      @click="onClick"
    >
      <TabIcon
        text-xl
        :icon="tab.icon" :title="tab.title"
      />
    </Component>
    <template #popper>
      <div>
        {{ tab.title }}
      </div>
    </template>
  </VTooltip>
</template>
