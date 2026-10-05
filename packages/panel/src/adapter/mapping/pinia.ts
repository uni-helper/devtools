import type { PiniaStateResult } from '@uni-helper/devtools-devframe/types'
import type { ComponentStateSnapshotMessage, StateEntry } from '@vue/devtools-kit'
import { toStateEntry } from './state'

/**
 * Pinia 检查器聚合根节点（官方 pinia devtools 插件同款常量：
 * pinia/dist `PINIA_ROOT_ID = '_root'` / `PINIA_ROOT_LABEL = '🍍 Pinia (root)'`）。
 * 根节点与各 store 平级（非父子嵌套），选中展示按 store id 聚合的 state/getters。
 */
export const PINIA_ROOT_ID = '_root'
export const PINIA_ROOT_LABEL = '🍍 Pinia (root)'

export function toPiniaStateSnapshot(result: PiniaStateResult, version: number): ComponentStateSnapshotMessage {
  // 官方编辑路由靠 entry.meta.inspectorId/nodeId 区分 inspector 条目（kit
  // createInspectorStateSnapshot 的 toInspectorLegacyStateEntries 同款注入；漏了
  // 会路由到 components:editState 且因 inspector 页无选中组件而静默无效）；
  // componentId 也对齐官方合成约定 `inspector:<id>:<nodeId>`
  const nodeId = `store:${result.id}`
  const withInspectorMeta = (entry: StateEntry): StateEntry => ({
    ...entry,
    meta: { ...entry.meta, inspectorId: 'pinia', nodeId, disableAdd: true },
  })
  const sections: ComponentStateSnapshotMessage['sections'] = []
  const stateEntries = Object.entries(result.state ?? {}).map(
    ([key, value]) => withInspectorMeta(toStateEntry('state', key, { value })),
  )
  if (stateEntries.length > 0)
    sections.push({ id: 'state', label: 'State', entries: stateEntries })
  // getters 是 computed 求值属性：探针侧编辑必然 Key not found，如实标记不可编辑
  const getterEntries = Object.entries(result.getters ?? {}).map(
    ([key, value]) => {
      const entry = withInspectorMeta(toStateEntry('getters', key, { value }))
      entry.editable = false
      return entry
    },
  )
  if (getterEntries.length > 0)
    sections.push({ id: 'getters', label: 'Getters', entries: getterEntries })
  return { componentId: `inspector:pinia:${nodeId}`, version, sections }
}

/**
 * 聚合根节点快照（官方 pinia 插件 `_root` 的 formatStoreForInspectorState(pinia) 语义）：
 * state 组按 store id 放整个 $state 对象（可编辑，深路径编辑路由见 inspectors:editState）；
 * getters 组按 store id 聚合（不可编辑）；无 getters 的 store 不出 getters 条目。
 */
export function toPiniaRootSnapshot(states: PiniaStateResult[], version: number): ComponentStateSnapshotMessage {
  const withRootMeta = (entry: StateEntry): StateEntry => ({
    ...entry,
    meta: { ...entry.meta, inspectorId: 'pinia', nodeId: PINIA_ROOT_ID, disableAdd: true },
  })
  const sections: ComponentStateSnapshotMessage['sections'] = []
  const stateEntries = states.map(
    s => withRootMeta(toStateEntry('state', s.id, { value: s.state })),
  )
  if (stateEntries.length > 0)
    sections.push({ id: 'state', label: 'State', entries: stateEntries })
  const getterEntries = states
    .filter(s => Object.keys(s.getters ?? {}).length > 0)
    .map((s) => {
      const entry = withRootMeta(toStateEntry('getters', s.id, { value: s.getters }))
      entry.editable = false
      return entry
    })
  if (getterEntries.length > 0)
    sections.push({ id: 'getters', label: 'Getters', entries: getterEntries })
  return { componentId: `inspector:pinia:${PINIA_ROOT_ID}`, version, sections }
}
