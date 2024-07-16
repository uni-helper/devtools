<script setup lang="ts">
defineProps<{
  data?: unknown
}>()

function getDataKeysPreview(data: object) {
  if (isPlainObject(data)) {
    const rootKeyString = Object.entries(data).map(([key, value]) => {
      const format = formatStateType(value)
      return `${key}: ${format?.rawDisplay || format.value}`
    }).join(',  ')
    return `{${rootKeyString}}`
  }

  if (isArray(data)) {
    // const rootKeyString =
    return `(${Array.from(data).length}) [${data}]`
  }
}
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
  <template v-if="typeof data === 'object' && data !== null">
    <ToggleExpanded
      :value="false"
      cursor-pointer
    />
    <span font-state-field text-3.5 italic>
      {{ getDataKeysPreview(data) }}
    </span>
  </template>
  <template v-else>
    <span :class="colorByType(data)" pl1rem>
      <template v-if="typeof data === 'bigint'">
        {{ data }}{{ 'n' }}
      </template>
      <template v-else-if="typeof data === 'undefined'">
        {{ 'undefined' }}
      </template>
      <template v-else>
        {{ data }}
      </template>
    </span>
  </template>
</template>
