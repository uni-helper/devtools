<script setup lang="ts">
const data = await trpc.staticAssets.query()
console.log(data)
</script>

<template>
  <div>
    <slot />
  </div>
</template>
