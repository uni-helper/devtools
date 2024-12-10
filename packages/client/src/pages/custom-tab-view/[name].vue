<script setup lang="ts">
import type { CustomTab } from '@vue/devtools-kit'
import type { ComputedRef } from 'vue'

const route = useRoute()
const router = useRouter()
const { flattenedTabs } = useTabs()
// @ts-expect-error name is defined in router
const tabName = computed(() => route.params.name)
const tab = computed(() => flattenedTabs.value.find(tab => tabName.value! === tab.name) || null!) as ComputedRef<CustomTab>

onMounted(() => {
  if (!tab.value) {
    const timer = setTimeout(() => {
      if (tab.value) {
        clearTimeout(timer)
        return
      }
      router.replace('/overview')
    }, 2000)
  }
})
</script>

<template>
  <CustomTabComponent :tab="tab" />
</template>
