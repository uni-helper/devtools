<script setup lang="ts">
const pageData = ref('')
onMounted(async () => {
  const response = await fetch('/api/component')
  pageData.value = await response.json()
})
</script>

<template>
  {{ pageData }}
</template>
