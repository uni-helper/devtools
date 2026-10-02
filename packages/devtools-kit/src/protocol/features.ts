// uni-devtools 分歧：官方门禁 3.6.0（其探针依赖 3.6 的 effect 构造器命名，
// SetupRenderEffect/WatcherEffect 等）。我们放宽到 3.5.0——响应式双向链表
// （deps/subs/nextDep/nextSub）3.5 已有，devframe 探针的类型判定带 3.5 容错
// 启发（Watcher/cb/render 闭包插桩标记），判定不出仅退化为 unknown 节点而非
// 缺图；3.4 及更早无链表结构，探针产出空图，此时门禁自然保持关闭。
// 注意：下方比较数组是硬编码字面量（官方如此），与常量需同步改。
export const REACTIVITY_GRAPH_MIN_VUE_VERSION = '3.5.0'

export function supportsReactivityGraphVueVersion(version: string | undefined): boolean {
  const parts = parseVueVersion(version)
  if (!parts) return false

  return compareVersionParts(parts, [3, 5, 0]) >= 0
}

function parseVueVersion(version: string | undefined): [number, number, number] | undefined {
  const match = version?.trim().match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?/)
  if (!match) return

  return [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)]
}

function compareVersionParts(
  current: [number, number, number],
  minimum: [number, number, number],
): number {
  for (let index = 0; index < minimum.length; index++) {
    const diff = current[index] - minimum[index]
    if (diff !== 0) return diff
  }

  return 0
}
