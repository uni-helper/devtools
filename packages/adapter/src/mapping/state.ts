import type {
  ComponentStateEntry,
  ComponentStateResult,
} from '@uni-helper/devtools-shared'
import type {
  ComponentStateSnapshotMessage,
  EncodedValue,
  StateEntry,
} from '@vue/devtools-kit'
import { encodeValue } from '@vue/devtools-kit'

// 形状由调用方显式给出：setup/setupOther/computed 段传探针 entry，
// props/data/attrs（与 Pinia state/getters）传裸值时包一层 { value }——
// 不做启发式探测，用户数据里恰好叫 editable/raw/fn 的键不能被误读成元信息。
export function toStateEntry(
  sectionId: string,
  key: string,
  entry: ComponentStateEntry,
): StateEntry {
  let encodedVal: EncodedValue
  if (entry.fn) {
    encodedVal = {
      kind: 'function',
      name: entry.fnName,
      sourcePreview: entry.fnSource,
    }
  } else {
    encodedVal = encodeValue(entry.value, {
      maxDepth: 8,
      maxEntries: 100,
    }) as EncodedValue
  }

  let editable: boolean
  if (entry.readonly === true) {
    editable = false
  } else if (typeof entry.editable === 'boolean') {
    editable = entry.editable
  } else if (
    sectionId === 'props' ||
    sectionId === 'data' ||
    sectionId === 'state'
  ) {
    editable = true
  } else if (sectionId === 'setup') {
    editable = !entry.readonly && entry.stateType !== 'computed'
  } else {
    editable = false
  }

  const meta: Record<string, unknown> = {}
  if (entry.stateType) {
    meta.stateType = entry.stateType
    meta.stateTypeName =
      entry.stateType[0].toUpperCase() + entry.stateType.slice(1)
  }
  if (entry.readonly === true) {
    meta.readonly = true
  }
  if (entry.raw) {
    meta.raw = entry.raw
  }

  return {
    key,
    path: [sectionId, key],
    value: encodedVal,
    editable,
    ...(Object.keys(meta).length > 0 ? { meta } : {}),
  }
}

export function toStateSnapshot(
  result: ComponentStateResult,
  version: number,
): ComponentStateSnapshotMessage {
  const sections: ComponentStateSnapshotMessage['sections'] = []

  const propsEntries = Object.entries(result.props ?? {}).map(([key, value]) =>
    toStateEntry('props', key, { value }),
  )
  if (propsEntries.length > 0)
    sections.push({ id: 'props', label: 'Props', entries: propsEntries })

  const dataEntries = Object.entries(result.data ?? {}).map(([key, value]) =>
    toStateEntry('data', key, { value }),
  )
  if (dataEntries.length > 0)
    sections.push({ id: 'data', label: 'Data', entries: dataEntries })

  const setupEntries = Object.entries(result.setup ?? {}).map(([key, entry]) =>
    toStateEntry('setup', key, entry),
  )
  if (setupEntries.length > 0)
    sections.push({ id: 'setup', label: 'Setup', entries: setupEntries })

  const setupOtherEntries = Object.entries(result.setupOther ?? {}).map(
    ([key, entry]) => toStateEntry('setup-other', key, entry),
  )
  if (setupOtherEntries.length > 0)
    sections.push({
      id: 'setup-other',
      label: 'Setup (other)',
      entries: setupOtherEntries,
    })

  const computedEntries = Object.entries(result.computed ?? {}).map(
    ([key, entry]) => toStateEntry('computed', key, entry),
  )
  if (computedEntries.length > 0)
    sections.push({
      id: 'computed',
      label: 'Computed',
      entries: computedEntries,
    })

  const attrsEntries = Object.entries(result.attrs ?? {}).map(([key, value]) =>
    toStateEntry('attrs', key, { value }),
  )
  if (attrsEntries.length > 0)
    sections.push({ id: 'attrs', label: 'Attrs', entries: attrsEntries })

  // reactivityGraph 搭 state 快照的便车透传（官方 kit 协议同名字段，
  // Graph tab 从 components:stateSnapshot 响应里读图，无独立 RPC）
  return {
    componentId: result.id,
    version,
    sections,
    ...(result.reactivityGraph
      ? { reactivityGraph: result.reactivityGraph }
      : {}),
  }
}
