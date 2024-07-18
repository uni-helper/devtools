<script setup lang="tsx">
defineProps<{
  data?: unknown
}>()

function renderCollection(items: any[], isObject: boolean = false) {
  return items.map((item, index, array) => {
    const key = isObject ? item[0] : null
    const value = isObject ? item[1] : item
    const formatState = formatStateValue(value)

    return (
      <>
        {isObject && `${key}: `}
        <span style={{ color: formatState?.color }}>
          {formatState.rawDisplay}
        </span>
        {index !== array.length - 1 ? ', ' : ''}
      </>
    )
  })
}

function DataKeysPreview(data: object) {
  if (isPlainObject(data)) {
    const entries = Object.entries(data)
    return (
      <>
        {'{'}
        {renderCollection(entries, true)}
        {'}'}
      </>
    )
  }

  else if (isArray(data)) {
    const arrayData = Array.from(data)
    return (
      <>
        {`(${arrayData.length}) `}
        [
        {renderCollection(arrayData)}
        ]
      </>
    )
  }

  else if (isSet(data)) {
    const setData = Array.from(data)
    return (
      <>
        {`Set(${setData.length}) `}
        {`{`}
        {renderCollection(setData)}
        {`}`}
      </>
    )
  }

  else if (isMap(data)) {
    const mapData = Array.from((data as Map<any, any>).entries())
    return (
      <>
        {`Map(${mapData.length}) `}
        {`{`}
        {renderCollection(mapData, true)}
        {`}`}
      </>
    )
  }
}
function CustomValuePreview(data: unknown) {
  const formatState = formatStateValue(data)
  return (
    <span style={{ color: formatState?.color }} class="pl1rem">
      {formatState.rawDisplay}
    </span>
  )
}
const isExpanded = ref(false)
function toggleExpanded() {
  isExpanded.value = !isExpanded.value
}
</script>

<template>
  <div v-if="typeof data === 'object' && data !== null" truncate @click="toggleExpanded">
    <ToggleExpanded
      :value="isExpanded"
      cursor-pointer
    />
    <span class="font-state-field text-3.5 italic">
      <component :is="DataKeysPreview(data)" />
    </span>
    <ChildStateViewer v-if="isExpanded" :data />
  </div>
  <component :is="CustomValuePreview(data)" v-else />
</template>
