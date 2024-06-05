<script setup lang="ts">
const props = defineProps<{
  modelValue?: boolean
}>()
</script>

<template>
  <div>
    test {{ props.modelValue }}
  </div>
</template>
