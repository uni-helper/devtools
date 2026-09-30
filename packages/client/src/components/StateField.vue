<script setup lang="ts">
import { computed, ref } from 'vue'

const props = defineProps<{
  data: any
  depth?: number
  keyPath?: string
  componentId?: number
  editable?: boolean
}>()

const depth = props.depth ?? 0
const isExpanded = ref(depth < 2) // 默认展开前两层
const isEditing = ref(false)
const editValue = ref('')

const dataType = computed(() => {
  if (props.data === null)
    return 'null'
  if (props.data === undefined)
    return 'undefined'
  if (Array.isArray(props.data))
    return 'array'
  return typeof props.data
})

const isExpandable = computed(() => {
  return dataType.value === 'object' || dataType.value === 'array'
})

const isEditable = computed(() => {
  return props.editable && ['string', 'number', 'boolean'].includes(dataType.value)
})

const displayValue = computed(() => {
  switch (dataType.value) {
    case 'string':
      return `"${props.data}"`
    case 'number':
    case 'boolean':
      return String(props.data)
    case 'null':
      return 'null'
    case 'undefined':
      return 'undefined'
    case 'function':
      return 'ƒ ()'
    case 'array':
      return `Array(${props.data.length})`
    case 'object':
      return `Object {${Object.keys(props.data).length}}`
    default:
      return String(props.data)
  }
})

const typeColor = computed(() => {
  switch (dataType.value) {
    case 'string':
      return 'text-green-600 dark:text-green-400'
    case 'number':
      return 'text-blue-600 dark:text-blue-400'
    case 'boolean':
      return 'text-purple-600 dark:text-purple-400'
    case 'null':
    case 'undefined':
      return 'text-gray-500 dark:text-gray-400'
    case 'function':
      return 'text-pink-600 dark:text-pink-400'
    default:
      return 'text-gray-700 dark:text-gray-300'
  }
})

function toggleExpand() {
  if (isExpandable.value) {
    isExpanded.value = !isExpanded.value
  }
}

function startEdit() {
  if (!isEditable.value)
    return
  isEditing.value = true
  editValue.value = dataType.value === 'string' ? props.data : String(props.data)
}

function saveEdit() {
  if (!props.keyPath || !props.componentId)
    return

  let newValue: any = editValue.value

  // 转换类型
  if (dataType.value === 'number') {
    newValue = Number(editValue.value)
    if (Number.isNaN(newValue)) {
      console.error('Invalid number value')
      cancelEdit()
      return
    }
  }
  else if (dataType.value === 'boolean') {
    newValue = editValue.value.toLowerCase() === 'true'
  }

  // eslint-disable-next-line no-console
  console.log('[StateField] Updating', props.keyPath, 'to', newValue)

  // 发送更新请求（使用 mutate 而不是 subscribe）
  trpc.updateComponentData.mutate({
    id: props.componentId,
    key: props.keyPath,
    value: newValue,
  }).then(() => {
    // eslint-disable-next-line no-console
    console.log('[StateField] Update successful')
    isEditing.value = false
  }).catch((error) => {
    console.error('[StateField] Update failed:', error)
    cancelEdit()
  })
}

function cancelEdit() {
  isEditing.value = false
  editValue.value = ''
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    saveEdit()
  }
  else if (event.key === 'Escape') {
    cancelEdit()
  }
}
</script>

<template>
  <div class="state-field">
    <div class="flex items-start gap-1">
      <button
        v-if="isExpandable"
        class="expand-button"
        :class="{ expanded: isExpanded }"
        @click="toggleExpand"
      >
        <span class="text-xs">▶</span>
      </button>
      <span v-else class="w-4" />

      <span
        v-if="!isEditing"
        class="font-mono text-sm cursor-pointer hover:opacity-80"
        :class="[typeColor, { 'editable-value': isEditable }]"
        :title="isEditable ? 'Double-click to edit' : ''"
        @dblclick="startEdit"
      >
        {{ displayValue }}
      </span>

      <input
        v-else
        v-model="editValue"
        class="edit-input font-mono text-sm px-1 border border-primary-500 rounded"
        :class="typeColor"
        @blur="saveEdit"
        @keydown="handleKeydown"
        @mounted="($event.target as HTMLInputElement).focus()"
      >
    </div>

    <div v-if="isExpanded && isExpandable" class="ml-4 mt-1 border-l-2 border-gray-200 dark:border-gray-700 pl-2">
      <template v-if="dataType === 'array'">
        <div v-for="(item, index) in data" :key="index" class="mb-1">
          <div class="flex items-start gap-2">
            <span class="font-mono text-xs text-gray-500 min-w-[40px]">[{{ index }}]:</span>
            <StateField
              :data="item"
              :depth="depth + 1"
              :key-path="keyPath ? `${keyPath}[${index}]` : `[${index}]`"
              :component-id="componentId"
              :editable="editable"
            />
          </div>
        </div>
      </template>
      <template v-else-if="dataType === 'object'">
        <div v-for="(value, key) in data" :key="String(key)" class="mb-1">
          <div class="flex items-start gap-2">
            <span class="font-mono text-xs text-gray-600 dark:text-gray-400 min-w-[80px]">{{ key }}:</span>
            <StateField
              :data="value"
              :depth="depth + 1"
              :key-path="key as string"
              :component-id="componentId"
              :editable="editable"
            />
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.expand-button {
  transition: transform 0.2s;
  cursor: pointer;
  padding: 0;
  background: none;
  border: none;
  color: #888;
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.expand-button:hover {
  color: #333;
}

.dark .expand-button:hover {
  color: #ccc;
}

.expand-button.expanded {
  transform: rotate(90deg);
}

.editable-value {
  border-bottom: 1px dashed currentColor;
}

.edit-input {
  outline: none;
  background: transparent;
}

.edit-input:focus {
  outline: 2px solid currentColor;
}
</style>
