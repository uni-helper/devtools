<script setup lang="ts">
import { VueBadge } from '@vue/devtools-ui'

const data = ref('')
onMounted(async () => {
  const response = await fetch('/api/getPages')
  data.value = await response.json()
})
</script>

<template>
  <VueBadge
    bg-green-400:10 text-green-400
    title="active"
  />
  <div>
    {{ data }}
  </div>
</template>
