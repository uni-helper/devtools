/**
 * 渲染钩子（编译期插桩的运行时半边，instrument.ts 注入 `__uniDevtoolsNotifyRender`）。
 *
 * mp 构建没有 __VUE_DEVTOOLS_GLOBAL_HOOK__，「数据变了」唯一可靠信号就是
 * 组件真的重新渲染了。编译期把每个组件的 render 函数包一层：每次渲染调度一次
 * 树推送（防抖合并），组件树/状态在用户改 data 后 ~debounce 内到达面板，
 * 替代 2s 快照比对轮询的高延迟路径（轮询保留作非渲染变更的兜底）。
 *
 * 约束：包装函数保持 length 2（uni mp render 约定 (_ctx, _cache)，运行时对
 * 函数式组件有 render2.length > 1 分支判定）；非函数输入原样放行，绝不炸渲染。
 * 禁浏览器 API（globalThis 在既有探针代码中已验证可用）。
 */

import { schedulePushComponentTree } from './index.ts'

export function __uniDevtoolsNotifyRender(renderFn: any): any {
  if (typeof renderFn !== 'function')
    return renderFn
  return function wrappedRender(this: any, _ctx: unknown, _cache: unknown) {
    try {
      schedulePushComponentTree(300)
    }
    catch {
      // 探针未初始化/推送异常绝不影响渲染
    }
    return renderFn.call(this, _ctx, _cache)
  }
}
