// uni-devtools：上游 kit `protocol/features.ts` 的**本地分叉**，不是临时补丁。
//
// 为什么分叉：官方门禁硬编码 3.6.0（其探针依赖 3.6 的 effect 构造器命名
// SetupRenderEffect/WatcherEffect 等），而小程序内置 Vue 多为 3.5.x。响应式双向链表
// （deps/subs/nextDep/nextSub）3.5 已有，devframe 探针带 3.5 容错启发
// （Watcher/cb/render 闭包插桩标记），判定不出仅退化为 unknown 节点而非缺图。
// 门槛不能再降：3.4 及更早无链表结构，探针只能产出空图。
//
// 何时可退役：上游若接受「门禁做成可选参数」的提案，本文件即可删除，改为
//   supportsReactivityGraphVueVersion(version, '3.5.0')
// 注意即便上游接受，其默认值仍是 3.6——我们与上游在此行为上不会合流，
// 只是从「自己实现一份」变成「引上游 + 传参」。
export const REACTIVITY_GRAPH_MIN_VUE_VERSION = '3.5.0'

export function supportsReactivityGraphVueVersion(
  version: string | undefined,
): boolean {
  const parts = parseVueVersion(version)
  if (!parts) return false

  return compareVersionParts(parts, [3, 5, 0]) >= 0
}

function parseVueVersion(
  version: string | undefined,
): [number, number, number] | undefined {
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
