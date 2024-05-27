<script setup lang="ts">
import { VueBadge } from '@vue/devtools-ui'

const data = ref('')
onMounted(async () => {
  const response = await fetch('/api/getPages')
  data.value = await response.json()
})
</script>

<template>
  <div>
    {{ data }}
  </div>
</template>
