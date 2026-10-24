/**
 * node 侧 NetworkRecord 合并（纯函数，push-network-records 使用，可脱离
 * devframe.ts 闭包单测）。同 id 二次到达是常态而非异常：
 * - 记录创建时（pending 快照）可能随其他请求触发的批次先被推出；
 * - 完成时探针补推终态（agent/network.ts 脏集）；
 * - socket 重连后探针重置水位、全环重推。
 *
 * 合并规则：未知 id 插入；已知 id 仅当「未完成 → 已完成」（duration
 * undefined → 有值，complete 回调必写 duration）才覆盖。其余到达（等值重推、
 * 更旧的 pending 快照）一律保留现值——终态一旦落定不会被回滚，重放幂等。
 *
 * 本文件进 node 侧 devframe bundle，不 import 运行时依赖（类型导入除外）。
 */
import type { NetworkRecord } from '../types.ts'

export function isNetworkRecordCompletion(
  existing: NetworkRecord,
  incoming: NetworkRecord,
): boolean {
  return existing.duration === undefined && incoming.duration !== undefined
}

export function mergeNetworkRecords(
  existing: NetworkRecord[],
  incoming: NetworkRecord[],
): NetworkRecord[] {
  const byId = new Map<number, NetworkRecord>()
  for (const rec of existing) {
    if (rec && typeof rec.id === 'number' && Number.isFinite(rec.id)) {
      byId.set(rec.id, rec)
    }
  }
  for (const rec of incoming) {
    if (!rec || typeof rec.id !== 'number' || !Number.isFinite(rec.id)) {
      continue
    }
    const known = byId.get(rec.id)
    if (!known || isNetworkRecordCompletion(known, rec)) {
      byId.set(rec.id, rec)
    }
  }
  // id 升序：面板增量渲染与 sinceId 语义依赖；增量乱序到达仍保序
  return Array.from(byId.values()).sort((a, b) => a.id - b.id)
}
