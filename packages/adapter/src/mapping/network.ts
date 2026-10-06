import type { NetworkRecord } from '@uni-helper/devtools-shared'

export function mergeRecordsById(
  prev: NetworkRecord[],
  incoming: NetworkRecord[],
  capacity: number,
): NetworkRecord[] {
  const map = new Map<number, NetworkRecord>()
  for (const r of prev)
    map.set(r.id, r)
  for (const r of incoming)
    map.set(r.id, r)
  const result = Array.from(map.values()).sort((a, b) => a.id - b.id)
  if (result.length > capacity)
    result.splice(0, result.length - capacity)
  return result
}
