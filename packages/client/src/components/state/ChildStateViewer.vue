<script setup lang="ts">
withDefaults(defineProps<{
  data: unknown
  depth?: number
  expandedId: string[]
}>(), {
  depth: 0,
})
</script>

<template>
  <div>
    {{ data }}
  </div>
</template>
