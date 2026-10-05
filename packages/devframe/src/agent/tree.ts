/**
 * 最小组件树采集模块
 * 沿 page.$vm → $.subTree/.component 递归采集组件树
 * 约束：纯 JSON 可序列化、无循环引用（浏览器全局禁用由 eslint no-restricted-globals 执法）
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

let cachedVueVersion: string | undefined

export function clearInstanceRegistry(): void {
  instanceRegistry.clear()
  cachedVueVersion = undefined
}

/**
 * Vue 运行时版本（app.version）。面板 Graph tab 的门禁消费它
 * （kit supportsReactivityGraphVueVersion）；同一运行时恒定，读到即缓存。
 */
export function getVueRuntimeVersion(): string | undefined {
  if (cachedVueVersion)
    return cachedVueVersion

  for (const vm of instanceRegistry.values()) {
    try {
      const internal = vm.$ || vm
      const version = internal?.appContext?.app?.version
      if (typeof version === 'string' && version) {
        cachedVueVersion = version
        return version
      }
    }
    catch {
      // 单实例读取失败换下一个
    }
  }

  // 实例注册表暂无节点时（如首次推送在组件遍历前/首屏过渡期），尝试从全局 getApp() 读取
  try {
    const app = typeof getApp === 'function' ? getApp() : (globalThis as any).getApp?.()
    const appVm = app?.$vm || app
    const internal = appVm?.$ || appVm
    const version = internal?.appContext?.app?.version || (app as any)?.appContext?.app?.version
    if (typeof version === 'string' && version) {
      cachedVueVersion = version
      return version
    }
  }
  catch {
    // 忽略异常继续尝试
  }

  // 全局 Vue 尝试
  try {
    const gVue = (globalThis as any).Vue
    if (typeof gVue?.version === 'string' && gVue.version) {
      cachedVueVersion = gVue.version
      return gVue.version
    }
  }
  catch {
    // 降级静默
  }

  return undefined
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
 * 编译期写入端见 instrument.ts 的 injectEntryFileGuard（`__file` 兜底命名
 * 与本函数一致是冻结契约）。
 */
export function getComponentDisplayName(typeObj: any, vnodeTag?: string): string | undefined {
  return typeObj?.name
    || typeObj?.__name
    || typeObj?.displayName
    || typeObj?.fileName
    || fileBasename(typeObj?.__file || typeObj?.filePath)
    || vnodeTag
}

function collectComponentsFromVNode(vnode: any, out: any[], visited: Set<any>, depth = 0): void {
  if (!vnode || depth > 20)
    return

  // 组件 vnode 只收集实例、不下探其子树——子组件的子树由其自身递归覆盖
  if (vnode.component) {
    const compInstance = vnode.component.proxy || vnode.component
    if (compInstance && !visited.has(compInstance)) {
      out.push(compInstance)
    }
    return
  }

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

function findChildVMs(vm: any, internal: any, visited: Set<any>): any[] {
  const children: any[] = []

  // $children：uni-app mp 的关键路径（Vue proxy 层直接给子实例）
  const rawChildren = vm?.$children || internal?.$children
  if (Array.isArray(rawChildren) && rawChildren.length > 0) {
    for (const child of rawChildren) {
      if (child && !visited.has(child)) {
        children.push(child)
      }
    }
    return children
  }

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
