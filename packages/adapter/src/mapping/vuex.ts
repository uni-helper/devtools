import type { VuexStateResult } from '@uni-helper/devtools-shared'
import type {
  ComponentStateSnapshotMessage,
  StateEntry,
} from '@vue/devtools-kit'
import { toStateEntry } from './state.ts'

/**
 * Vuex 检查器聚合根节点（对齐 Pinia 的常量命名模式）。
 * 根节点与各 module 平级（非父子嵌套），选中展示按 module 聚合的 state/getters。
 */
export const VUEX_ROOT_ID = '_root'
export const VUEX_ROOT_LABEL = '📦 Vuex (root)'

export function toVuexStateSnapshot(
  result: VuexStateResult,
  version: number,
): ComponentStateSnapshotMessage {
  // 官方编辑路由靠 entry.meta.inspectorId/nodeId 区分 inspector 条目
  // nodeId 格式：'vuex-root' 或 'module:<path>'（扁平化平级节点）
  // 修复 Critical 1: 根 store 使用 'vuex-root'，与聚合根 '_root' 区分
  const nodeId = result.id === '_root' ? 'vuex-root' : `module:${result.id}`

  // 元信息注入包装器，并在此处注入 warning 提示（修复 CR M1-A）
  const withInspectorMeta = (
    entry: StateEntry,
    addWarning = false,
  ): StateEntry => ({
    ...entry,
    meta: {
      ...entry.meta,
      inspectorId: 'vuex',
      nodeId,
      disableAdd: true,
      // State 可编辑但添加警告提示（折中方案）
      ...(addWarning
        ? {
            warning:
              'Direct state mutation. Consider using mutations in production.',
          }
        : {}),
    },
  })

  const sections: ComponentStateSnapshotMessage['sections'] = []

  // State 分区：可编辑 + 警告提示
  const stateEntries = Object.entries(result.state ?? {}).map(([key, value]) =>
    withInspectorMeta(
      toStateEntry('state', key, { value, editable: true }),
      true, // 添加 warning
    ),
  )
  if (stateEntries.length > 0)
    sections.push({ id: 'state', label: 'State', entries: stateEntries })

  // Getters 分区：只读 + 错误捕获
  // 注意：getters 的错误捕获在探针侧完成（extractGetters），这里只标记不可编辑
  const getterEntries = Object.entries(result.getters ?? {}).map(
    ([key, value]) =>
      withInspectorMeta(
        toStateEntry('getters', key, { value, editable: false }),
      ),
  )
  if (getterEntries.length > 0)
    sections.push({ id: 'getters', label: 'Getters', entries: getterEntries })

  return {
    componentId: `inspector:vuex:${nodeId}`,
    version,
    sections,
  }
}

/**
 * Vuex 聚合根快照：选中 `📦 Vuex (root)` 虚拟节点时的展示内容。
 * State 分区展示每个 store/module 的 state 对象，Getters 分区展示各 store/module 的 getters。
 * 修复 CR C1-A：必须使用 toStateEntry + withInspectorMeta 注入完整元信息
 */
export function toVuexRootSnapshot(
  stores: VuexStateResult[],
  version: number,
): ComponentStateSnapshotMessage {
  const nodeId = VUEX_ROOT_ID
  const withInspectorMeta = (entry: StateEntry): StateEntry => ({
    ...entry,
    meta: { ...entry.meta, inspectorId: 'vuex', nodeId, disableAdd: true },
  })

  const sections: ComponentStateSnapshotMessage['sections'] = []
  const stateEntries: StateEntry[] = []
  const getterEntries: StateEntry[] = []

  for (const s of stores) {
    // 修复 CR C1-A：使用 toStateEntry 进行编码 + withInspectorMeta 注入元信息
    stateEntries.push(
      withInspectorMeta(
        toStateEntry('state', s.id, { value: s.state ?? {}, editable: false }),
      ),
    )
    if (s.getters && Object.keys(s.getters).length > 0) {
      getterEntries.push(
        withInspectorMeta(
          toStateEntry('getters', s.id, { value: s.getters, editable: false }),
        ),
      )
    }
  }

  if (stateEntries.length > 0)
    sections.push({ id: 'state', label: 'State', entries: stateEntries })
  if (getterEntries.length > 0)
    sections.push({ id: 'getters', label: 'Getters', entries: getterEntries })

  return {
    componentId: `inspector:vuex:${nodeId}`,
    version,
    sections,
  }
}
