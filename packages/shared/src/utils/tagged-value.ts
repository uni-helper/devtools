/**
 * 探针 → node → 面板 / MCP 走的是 JSON，Map 与 Set 在 JSON 里没有对应形态
 * （按普通对象遍历只剩 `{}`）。探针把它们编码成带类型标记的对象，面板侧在
 * 交给 kit 的 encodeValue 之前还原成真正的 Map / Set；MCP 直接读到标记对象，
 * 内容同样完整。
 *
 * 放子路径导出（不进 barrel）：探针与 adapter 两端共用，见 index.ts 头注释。
 */

export const TAGGED_TYPE_KEY = '__uni_devtools_type__'

export interface TaggedMap {
  [TAGGED_TYPE_KEY]: 'Map'
  /** 键值对按插入顺序排列；键可以是任意（已序列化的）值，不限字符串 */
  entries: Array<[unknown, unknown]>
}

export interface TaggedSet {
  [TAGGED_TYPE_KEY]: 'Set'
  values: unknown[]
}

export function tagMap(entries: Array<[unknown, unknown]>): TaggedMap {
  return { [TAGGED_TYPE_KEY]: 'Map', entries }
}

export function tagSet(values: unknown[]): TaggedSet {
  return { [TAGGED_TYPE_KEY]: 'Set', values }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

/**
 * 把值里（任意深度）的 Map / Set 标记对象还原成真正的 Map / Set，其余原样返回。
 * 只认结构完整的标记，用户数据里恰好有同名键但形状不对的对象不会被误改。
 */
export function reviveTaggedValues(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reviveTaggedValues)
  if (!isPlainObject(value)) return value

  const tag = value[TAGGED_TYPE_KEY]
  if (tag === 'Map' && Array.isArray(value.entries)) {
    return new Map(
      (value.entries as unknown[])
        .filter((pair): pair is [unknown, unknown] => Array.isArray(pair))
        .map(([key, item]) => [
          reviveTaggedValues(key),
          reviveTaggedValues(item),
        ]),
    )
  }
  if (tag === 'Set' && Array.isArray(value.values)) {
    return new Set((value.values as unknown[]).map(reviveTaggedValues))
  }

  const out: Record<string, unknown> = {}
  for (const key of Object.keys(value))
    out[key] = reviveTaggedValues(value[key])
  return out
}
