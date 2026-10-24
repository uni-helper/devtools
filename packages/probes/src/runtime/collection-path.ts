/**
 * 面板编辑路径落在 Map / Set 上时的读写（组件状态、Pinia、Vuex 三处共用）。
 *
 * 面板把 Map 当集合展示，条目的路径段就是键的字符串形式。按普通对象处理
 * `parent[key] = value` 只会给 Map 对象挂一个普通属性，条目本身不变，页面
 * 也不报错——所以这里接管：Map 走 get / set / delete；Set 的元素没有键，
 * 按路径改不出确定的结果，明确报错。
 */

/** 路径段是字符串，Map 的键可能是数字等其他类型：按字符串形式匹配已有键 */
function resolveMapKey(map: Map<unknown, unknown>, segment: string): unknown {
  if (map.has(segment)) return segment
  for (const key of map.keys()) {
    if (String(key) === segment) return key
  }
  return segment
}

/** 沿路径读取下一层：Map 按键取条目，其余按属性取 */
export function readPathChild(parent: any, segment: string): any {
  if (parent instanceof Map) return parent.get(resolveMapKey(parent, segment))
  return parent[segment]
}

/**
 * 父对象是 Map / Set 时执行写入或删除并返回 true；其余类型返回 false，交还调用方
 * 按原有方式处理。
 */
export function writeCollectionEntry(
  parent: unknown,
  segment: string,
  value: unknown,
  remove: boolean | undefined,
): boolean {
  if (parent instanceof Map) {
    const key = resolveMapKey(parent, segment)
    if (remove) parent.delete(key)
    else parent.set(key, value)
    return true
  }
  if (parent instanceof Set) {
    throw new Error(
      `Set 的元素没有键，无法按路径「${segment}」修改；请在业务代码里增删元素`,
    )
  }
  return false
}
