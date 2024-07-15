<script setup lang="ts">
defineProps<{
  data?: unknown
}>()

// function getDataKeysPreview() {

// }
function colorByType(data: unknown) {
  const colorMap = {
    string: 'text-#D1977F',
    number: 'text-#9980FF',
    boolean: 'text-#9980FF',
    undefined: 'text-#ABABAB',
    symbol: 'text-#D1977F',
    bigint: 'text-#ABABAB',
    function: '',
    object: '',
  }
  const type = typeof data
  return colorMap[type] || 'text-#ABABAB'
}
</script>

<template>
  <template v-if="typeof data === 'object'">
    {{ data.tostring() }}
  </template>
  <template v-else>
    <span :class="colorByType(data)" pl1rem>
      {{ data }}
    </span>
  </template>
</template>
