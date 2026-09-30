<script setup lang="ts">
import type { ComponentTreeNode } from '@uni-helper/devtools-types'
import { computed, ref } from 'vue'
import { Pane, Splitpanes } from 'splitpanes'
import { VueInput } from '@vue/devtools-ui'
import { parse } from '@vue/devtools-kit'

let data: ComponentTreeNode[] = []
const tree = ref<ComponentTreeNode[]>([])
const selectedComponentId = ref<number | null>(null)
const componentData = ref<Record<string, any>>({})

trpc.onComponentTree.subscribe(undefined, {
  onData: (value) => {
    data = [value]
    tree.value = [value]
  },
})

function handleDateById(id: number | string) {
  // 确保 ID 是数字类型
  const numericId = typeof id === 'string' ? Number.parseInt(id, 10) : id
  console.log('[Client] Selected component ID:', numericId, '(original:', id, ')')
  selectedComponentId.value = numericId

  // 先清空之前的数据
  componentData.value = {}

  trpc.onComponentData.subscribe(numericId, {
    onData: (value) => {
      console.log('[Client] Component data received for ID', numericId, ':', value)
      // 解析序列化的数据
      const parsed: Record<string, any> = {}
      for (const [key, stringValue] of Object.entries(value)) {
        try {
          // value 是 stringify([actualValue]) 的结果，需要解析并取第一个元素
          const parsedArray = parse(stringValue as string)
          let parsedValue = Array.isArray(parsedArray) ? parsedArray[0] : parsedArray

          // 如果是 ref/reactive 等响应式对象，提取其实际值
          if (parsedValue && typeof parsedValue === 'object' && parsedValue._custom) {
            if (parsedValue._custom.type === 'ref' || parsedValue._custom.stateTypeName === 'Ref') {
              // ref 对象，使用其 value
              parsedValue = parsedValue._custom.value
            }
          }

          parsed[key] = parsedValue
        }
        catch (error) {
          console.error('[Client] Error parsing value for key:', key, error)
          parsed[key] = stringValue
        }
      }
      componentData.value = parsed
      console.log('[Client] Parsed component data:', parsed)
    },
    onError: (error) => {
      console.error('[Client] Error subscribing to component data:', error)
    },
  })
}

const filterComponentName = ref('')
const searchTerm = computed(() => filterComponentName.value.trim().toLowerCase())

// 使用计算属性来自动更新搜索结果，提高效率
const filteredTree = computed(() => {
  if (!searchTerm.value) {
    return data
  }
  return filterTree(data, searchTerm.value)
})

function filterTree(data: ComponentTreeNode[], searchTerm: string): ComponentTreeNode[] {
  const result: ComponentTreeNode[] = []
  for (const node of data) {
    const foundNode = searchNode(node, searchTerm)
    if (foundNode) {
      result.push(foundNode)
    }
  }
  return result
}

function searchNode(node: ComponentTreeNode, searchTerm: string): ComponentTreeNode | null {
  const name = node.toLowerCase()
  const hasMatch = name.includes(searchTerm)
  const filteredChildren = node.children?.map(child => searchNode(child, searchTerm)).filter(Boolean) || []

  if (filteredChildren.length > 0 || hasMatch) {
    return { ...node, children: filteredChildren as ComponentTreeNode[] }
  }
  return null
}

// 使用watchDebounced来处理输入，减少不必要的计算和更新
watchDebounced(
  searchTerm,
  () => {
    tree.value = filteredTree.value
  },
  { debounce: 300 },
)

const filterStateKey = ref('')

// 计算是否有数据
const hasData = computed(() => {
  return selectedComponentId.value !== null && Object.keys(componentData.value).length > 0
})

// 将组件数据转换为 RootStateViewer 需要的格式
const displayState = computed(() => {
  if (!filterStateKey.value) {
    return componentData.value
  }
  const search = filterStateKey.value.toLowerCase()
  const filtered: Record<string, any> = {}
  for (const [key, value] of Object.entries(componentData.value)) {
    if (key.toLowerCase().includes(search)) {
      filtered[key] = value
    }
  }
  return filtered
})

const emptyState = computed(() => !hasData.value)
</script>

<template>
  <PanelGrids block h-screen of-auto>
    <Splitpanes class="flex-1 overflow-auto">
      <Pane border="r base" size="40" h-full>
        <div class="p2">
          <div class="grid grid-cols-[1fr_auto] mb1 items-center gap2 pb1" border="b dashed base">
            <VueInput v-model="filterComponentName" placeholder="filter component name" />
          </div>

          <div no-scrollbar flex-1 select-none overflow-hidden px2>
            <TreeViewer :data="tree" :with-tag="true" :depth="0" @change="handleDateById" />
          </div>
        </div>
      </Pane>
      <Pane size="60">
        <div class="h-full flex flex-col p2">
          <div class="grid grid-cols-[1fr_auto] mb1 items-center gap2 pb1" border="b dashed base">
            <VueInput v-model="filterStateKey" placeholder="filter component state" />
          </div>
          <div v-if="!emptyState" class="no-scrollbar flex-1 overflow-scroll p-2">
            <div v-for="(value, key) in displayState" :key="key" class="mb-3">
              <div class="flex items-start gap-2">
                <span class="font-mono text-sm font-semibold text-primary-600 dark:text-primary-400 min-w-[120px]">{{ key }}:</span>
                <div class="flex-1">
                  <StateField
                    :data="value"
                    :depth="0"
                    :key-path="key as string"
                    :component-id="selectedComponentId"
                    :editable="true"
                  />
                </div>
              </div>
            </div>
          </div>
          <Empty v-else>
            {{ selectedComponentId === null ? 'Select a component to inspect' : 'No Data' }}
          </Empty>
        </div>
      </Pane>
    </Splitpanes>
  </PanelGrids>
</template>
