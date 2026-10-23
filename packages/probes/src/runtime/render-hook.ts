/**
 * 渲染钩子（编译期插桩的运行时半边，instrument.ts 注入 `__uniDevtoolsNotifyRender`）。
 *
 * 「数据变了」最可靠的信号是组件真的重新渲染了。编译期把每个组件的 render 函数
 * 包一层：每次渲染调度一次树推送（防抖合并），组件树/状态在用户改 data 后
 * ~debounce 内到达面板。Vue 3 线另有 DevTools 钩子的 component:updated 事件
 * （devtools-hook.ts）发同样的信号，两路经防抖与 Set 去重合并；本钩子是不依赖
 * 运行时事件的那一路。
 *
 * 约束：包装函数保持 length 2（uni mp render 约定 (_ctx, _cache)，运行时对
 * 函数式组件有 render2.length > 1 分支判定）；非函数输入原样放行，绝不炸渲染。
 * 禁浏览器 API（globalThis 在既有探针代码中已验证可用）。
 */

import {
  scheduleNotifyComponentRendered,
  schedulePushComponentTree,
} from './push.ts'
import { getComponentIdOfInstance } from './tree.ts'

export function __uniDevtoolsNotifyRender(renderFn: any): any {
  if (typeof renderFn !== 'function') return renderFn
  // 必须转发全部实参：mp 运行时以 7 参调用 render（proxy, renderCache, props,
  // setupState, data, ctx），plain <script>/Options 组件的编译 render 是 6 参签名
  // 且使用 $setup/$data——只转发前两个会让其渲染即崩。前两个具名参 + rest 使
  // length 保持 2（函数式组件 render.length > 1 判定用，虽然本包装不作用于它，
  // 保守起见维持约定）。
  const wrapped = function wrappedRender(
    this: any,
    _ctx: unknown,
    _cache: unknown,
    ...rest: unknown[]
  ) {
    try {
      schedulePushComponentTree(300)
      // 树推送过不了「内容没变」那道门，值变了得单独上报，面板才知道要重拉状态。
      // `this` 是组件 proxy（见 tree.ts 的 getComponentIdOfInstance）；未采过树的
      // 实例（首次渲染早于首轮采集）解析不到 id，静默跳过。
      scheduleNotifyComponentRendered(getComponentIdOfInstance(this))
    } catch {
      // 探针未初始化/推送异常绝不影响渲染
    }
    return renderFn.call(this, _ctx, _cache, ...rest)
  }
  // 冻结契约：render-code.ts 读取端按此标记解包原始 render（字面量两端同步，
  // 不可枚举——不进 Object.keys/JSON 序列化）
  Object.defineProperty(wrapped, '__uni_devtools_original_render__', {
    value: renderFn,
    enumerable: false,
    configurable: true,
  })
  return wrapped
}
