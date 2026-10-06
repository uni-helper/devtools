/**
 * Vue 实例字段的双版本访问器
 *
 * 探针同时服务两条运行时线，字段布局不同：
 *
 * | 概念 | Vue 3（`vm.$` = ComponentInternalInstance） | Vue 2（无 `vm.$`，字段直接在 vm 上） |
 * | --- | --- | --- |
 * | 组件选项 | `internal.type` | `vm.$options` |
 * | 实例 id | `internal.uid` | `vm._uid` |
 * | 所在 vnode | `internal.vnode` | `vm.$vnode` |
 * | 已销毁 | `internal.isUnmounted` | `vm._isDestroyed` |
 *
 * Vue 2 字段的可用性由真机实测确认（`spike/uni-vue2-webpack` 的「探针自检」页）。
 * 这里按字段探测而非全局版本号判断，避免依赖版本字符串解析。
 *
 * 约束：纯 JSON 可序列化无关；本模块只读实例字段，不产生副作用。
 */

/** Vue 3 的内部实例；Vue 2 没有 `vm.$`，退回 vm 本身 */
export function getInternal(vm: any): any {
  return vm?.$ || vm
}

/**
 * 组件选项对象（`name` / `__file` / `computed` / `props` 等的来源）
 * 与 `tree.ts` 的 `getComponentDisplayName` 配套：传错对象会让匿名组件退化成 `<Anonymous>`。
 */
export function getOptions(vm: any): any {
  const internal = getInternal(vm)
  return internal?.type || internal?.$options || {}
}

/** 实例 id。Vue 的 uid 按 app 实例计数，跨页面会撞车，调用方需自行加路由前缀 */
export function getUid(vm: any): number | string | undefined {
  const internal = getInternal(vm)
  return internal?.uid ?? internal?._uid
}

/** 实例所在的 vnode（组件标签名兜底用） */
export function getVNode(vm: any): any {
  const internal = getInternal(vm)
  return internal?.vnode || internal?.$vnode
}

/** 实例是否已销毁 */
export function isInstanceDestroyed(vm: any): boolean {
  const internal = getInternal(vm)
  return Boolean(internal?.isUnmounted || internal?._isDestroyed)
}

/** 组件 props 对象。Vue 3 在内部实例上，Vue 2 是 `vm.$props` */
export function getProps(vm: any): any {
  const internal = getInternal(vm)
  return internal?.props || internal?.$props
}

/** 透传 attrs。Vue 3 在内部实例上，Vue 2 是 `vm.$attrs` */
export function getAttrs(vm: any): any {
  const internal = getInternal(vm)
  return internal?.attrs || internal?.$attrs
}

/** 响应式数据对象。Vue 3 在内部实例上，Vue 2 是 `vm.$data` */
export function getData(vm: any): any {
  const internal = getInternal(vm)
  return internal?.data || internal?.$data
}

/**
 * 读值的代理。Vue 3 用内部 `proxy`，Vue 2 直接用 vm 本身
 * （computed 求值、`key in proxy` 探测都走它）。
 */
export function getProxy(vm: any): any {
  const internal = getInternal(vm)
  return internal?.proxy || vm
}

/**
 * Vue 2 的 Vue 构造函数（带静态 `set` / `delete`）；Vue 3 返回 `undefined`。
 *
 * Vue 2 的 `Vue.extend` 把基类挂在 `Sub.options._base`，同时静态继承到
 * `Sub` 上，所以 `vm.$options._base` 与 `vm.constructor` 都能取到。
 */
export function getVueCtor(vm: any): any {
  const internal = getInternal(vm)
  if (internal?.appContext)
    return undefined // Vue 3 内部实例
  const ctor = internal?.$options?._base || internal?.constructor
  return ctor && typeof ctor.set === 'function' && typeof ctor.delete === 'function'
    ? ctor
    : undefined
}

/**
 * 响应式赋值。
 *
 * Vue 3 的 Proxy 拦截一切写入，直接赋值即可；**Vue 2 只有已被 `defineReactive`
 * 声明过的键**才是响应式的——新增键必须 `Vue.set`，否则视图不更新（静默失效，
 * 最难查的一类 bug）。
 */
export function setReactive(vm: any, target: any, key: string, value: unknown): void {
  const Vue = getVueCtor(vm)
  if (!Vue) {
    if (Array.isArray(target) && /^\d+$/.test(key))
      target.splice(Number(key), 1, value)
    else
      target[key] = value
    return
  }

  // 数组下标赋值在 Vue 2 下不响应式，必须走 splice（长度不变）
  if (Array.isArray(target) && /^\d+$/.test(key)) {
    target.splice(Number(key), 1, value)
    return
  }
  if (!(key in target)) {
    Vue.set(target, key, value)
    return
  }
  target[key] = value
}

/** 响应式删除。Vue 2 必须 `Vue.delete`，否则视图不更新 */
export function deleteReactive(vm: any, target: any, key: string): void {
  const Vue = getVueCtor(vm)
  if (Vue) {
    Vue.delete(target, key)
    return
  }
  if (Array.isArray(target) && /^\d+$/.test(key)) {
    target.splice(Number(key), 1)
    return
  }
  delete target[key]
}
