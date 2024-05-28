<script setup lang="ts">
const data = ref('')
const response = await fetch('/api/getPages')
data.value = await response.json()
</script>

<template>
  <div>
    {{ data }}
  </div>
</template>
