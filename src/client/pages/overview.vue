<script setup lang="ts">
const pageData = ref(0)
const response = await fetch('/api/component')
pageData.value = (await response.json()).filter(item => item?.id?.endsWith('.vue')).length
// console.log(pageData.value)
// const comCount = computed(() => {
//   return pageData.value.filter(item => item?.id?.endswith('.vue')).length
// })
</script>

<template>
  {{ pageData }}
</template>
