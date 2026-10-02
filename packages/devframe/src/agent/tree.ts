/**
 * 最小组件树采集模块
 * 沿 page.$vm 沿 $.subTree/.component 递归采集组件树
 * 约束：纯 JSON 可序列化、无循环引用、禁止使用 window/document/location
 */

export interface ComponentTreeNode {
  id: string
  name: string
  type: string
  file?: string
  children?: ComponentTreeNode[]
}

export interface PageComponentTree {
  route: string
  components: ComponentTreeNode | null
}

declare const getCurrentPages: any

/**
 * 组件实例注册表（供运行时状态查看与编辑定位 vm）
 */
const instanceRegistry: Map<string, any> = new Map()

export function getRegisteredInstance(id: string): any | undefined {
  const instance = instanceRegistry.get(id)
  if (!instance)
    return undefined

  const internal = instance.$ || instance
  if (internal?.isUnmounted) {
    instanceRegistry.delete(id)
    return undefined
  }

  return instance
}

export function clearInstanceRegistry(): void {
  instanceRegistry.clear()
}

/** 文件路径 → 显示名（取 basename 去扩展名，如 `layouts/default.vue` → `default`） */
function fileBasename(file: string | undefined): string | undefined {
  if (!file)
    return undefined
  const base = file.split('/').pop() || file
  const stripped = base.replace(/\.[^.]+$/, '')
  return stripped || undefined
}

/**
 * 组件显示名兜底链：name → __name → displayName → fileName →
 * 文件名 basename（编译期 __file 注入，plain `<script>` SFC / layout 的
 * 唯一来源）→ vnode 标签 → Anonymous。
 * 与 state.ts 的取名逻辑保持一致。
 */
export function getComponentDisplayName(typeObj: any, vnodeTag?: string): string | undefined {
  return typeObj?.name
    || typeObj?.__name
    || typeObj?.displayName
    || typeObj?.fileName
    || fileBasename(typeObj?.__file || typeObj?.filePath)
    || vnodeTag
}

/**
 * 从 VNode 树中查找子组件实例
 */
function collectComponentsFromVNode(vnode: any, out: any[], visited: Set<any>, depth = 0): void {
  if (!vnode || depth > 20)
    return

  // 若当前 VNode 挂载了 component 实例，则收集该组件实例并终止本分支下探
  if (vnode.component) {
    const compInstance = vnode.component.proxy || vnode.component
    if (compInstance && !visited.has(compInstance)) {
      out.push(compInstance)
    }
    return
  }

  // 若为普通元素、Fragment 或插槽容器，继续遍历其子 VNode
  if (Array.isArray(vnode.children)) {
    for (const child of vnode.children) {
      if (child && typeof child === 'object') {
        collectComponentsFromVNode(child, out, visited, depth + 1)
      }
    }
  }
  else if (Array.isArray(vnode.dynamicChildren)) {
    for (const child of vnode.dynamicChildren) {
      if (child && typeof child === 'object') {
        collectComponentsFromVNode(child, out, visited, depth + 1)
      }
    }
  }
}

/**
 * 查找组件内部的直接子组件实例
 */
function findChildVMs(vm: any, internal: any, visited: Set<any>): any[] {
  const children: any[] = []

  // 1. 优先从 Vue proxy 层获取 $children（uni-app 小程序关键路径）
  const rawChildren = vm?.$children || internal?.$children
  if (Array.isArray(rawChildren) && rawChildren.length > 0) {
    for (const child of rawChildren) {
      if (child && !visited.has(child)) {
        children.push(child)
      }
    }
    return children
  }

  // 2. 沿 Vue 3 的 subTree 递归寻访
  const subTree = internal?.subTree || (internal?.$ && internal.$.subTree) || vm?.subTree
  if (subTree) {
    collectComponentsFromVNode(subTree, children, visited)
  }

  return children
}

/**
 * 提取单个组件节点并递归子树
 *
 * `idPrefix`（页面路由）参与 id 合成：Vue 的 uid 按 app 实例计数，多页面小程序
 * 里两个页面都会出现 uid=1，若只用裸 uid 做全局 id 与实例注册表 key，扁平化后
 * 会互相覆盖（树节点串页、状态读写打到错误实例）。
 */
export function extractComponentNode(
  vm: any,
  depth = 0,
  maxDepth = 10,
  visited: Set<any> = new Set(),
  idPrefix = '',
): ComponentTreeNode | null {
  if (!vm || depth >= maxDepth) {
    return null
  }

  // 防循环引用
  if (visited.has(vm)) {
    return null
  }
  visited.add(vm)

  try {
    const internal = vm.$ || vm
    const typeObj = internal.type || (internal.$ && internal.$.type) || {}
    const vnodeTag = internal.vnode && typeof internal.vnode.type === 'string' ? internal.vnode.type : undefined
    const rawName = getComponentDisplayName(typeObj, vnodeTag)
      || (depth === 0 ? 'App' : 'Anonymous')

    // 过滤开发工具自身内置注入的组件
    if (rawName === 'UniDevTools') {
      return null
    }

    const uid = internal.uid ?? (internal.$ && internal.$.uid) ?? `c_${depth}_${Math.random().toString(36).slice(2, 7)}`
    const id = idPrefix ? `${idPrefix}#${uid}` : String(uid)
    instanceRegistry.set(id, vm)
    const nodeType = depth === 0 ? 'page' : 'component'
    const filePath = typeObj.__file || typeObj.filePath || undefined

    const node: ComponentTreeNode = {
      id,
      name: String(rawName),
      type: nodeType,
    }

    if (filePath) {
      node.file = String(filePath)
    }

    // 查找并递归子组件
    const childVMs = findChildVMs(vm, internal, visited)
    if (childVMs.length > 0) {
      const childNodes: ComponentTreeNode[] = []
      for (const childVM of childVMs) {
        try {
          const childNode = extractComponentNode(childVM, depth + 1, maxDepth, visited, idPrefix)
          if (childNode) {
            childNodes.push(childNode)
          }
        }
        catch {
          // 单节点异常被隔离，不影响同级及上层树结构
        }
      }
      if (childNodes.length > 0) {
        node.children = childNodes
      }
    }

    return node
  }
  catch {
    return null
  }
}

/**
 * 采集当前小程序已加载页面的组件树列表
 */
export function collectComponentTree(customPages?: any[]): PageComponentTree[] {
  let pages: any[] = []

  if (customPages && Array.isArray(customPages)) {
    pages = customPages
  }
  else if (typeof getCurrentPages === 'function') {
    pages = getCurrentPages()
  }
  else if (typeof (globalThis as any).getCurrentPages === 'function') {
    pages = (globalThis as any).getCurrentPages()
  }

  if (!Array.isArray(pages)) {
    return []
  }

  // 清理已卸载的陈旧实例
  for (const [id, comp] of instanceRegistry.entries()) {
    const internal = comp.$ || comp
    if (internal?.isUnmounted) {
      instanceRegistry.delete(id)
    }
  }

  const results: PageComponentTree[] = []
  // 同一 route 在页面栈中出现多次时（同页/交替 navigateTo 压栈），Vue uid 按
  // 页面实例各自计数会撞车：两个实例的节点 id 都是 `route#1`、appId 也同为
  // route——面板按 appId 过滤会把两棵树合并成乱序重复树，treePatched 按 id
  // 去重时进一步互相覆盖、越积越乱。为第 2+ 次出现的实例在 route 上追加
  // 出现序号；首个实例保持裸 route，单实例场景 id 与冻结契约完全一致。
  const routeOccurrences = new Map<string, number>()

  for (const page of pages) {
    if (!page)
      continue

    const rawRoute = String(page.route || page.__route__ || page.path || 'unknown')
    const seen = (routeOccurrences.get(rawRoute) ?? 0) + 1
    routeOccurrences.set(rawRoute, seen)
    const route = seen > 1 ? `${rawRoute}@${seen}` : rawRoute
    const vm = page.$vm || page
    const visited = new Set<any>()
    let components: ComponentTreeNode | null = null

    try {
      components = extractComponentNode(vm, 0, 10, visited, route)
    }
    catch {
      components = null
    }

    results.push({
      route,
      components,
    })
  }

  return results
}
