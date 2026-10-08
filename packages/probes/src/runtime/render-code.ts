/**
 * 探针侧 Render Code 采集器
 * 从已注册组件实例提取 render / setup 源码并归一化缩进
 * 约束：全程 try/catch 防御、不抛错、禁浏览器 API、不 import devtools-kit
 */

import { getRegisteredInstance } from './tree.ts'

// 冻结契约：render-hook.ts 包装层暴露的原始 render 标记（字面量两端同步，不可枚举）
const ORIGINAL_RENDER_PROP = '__uni_devtools_original_render__'

/**
 * 按主体行最小公共缩进剥除
 * 参考 devtools/packages/kit/src/runtime/component-inspector.ts:185
 */
function normalizeFunctionIndentation(source: string): string {
  const lines = source.split('\n')
  if (lines.length < 2) return source

  const indents = lines
    .slice(1)
    .filter((line) => line.trim())
    .map((line) => line.match(/^[\t ]*/)?.[0] ?? '')
  if (!indents.length) return source

  let commonIndent = indents[0]!
  for (const indent of indents.slice(1)) {
    while (commonIndent && !indent.startsWith(commonIndent))
      commonIndent = commonIndent.slice(0, -1)
  }
  if (!commonIndent) return source

  return [
    lines[0],
    ...lines
      .slice(1)
      .map((line) =>
        line.startsWith(commonIndent) ? line.slice(commonIndent.length) : line,
      ),
  ].join('\n')
}

export function getComponentRenderCode(id: string): { code?: string } {
  try {
    if (!id || typeof id !== 'string') return {}

    const vm = getRegisteredInstance(id)
    if (!vm) return {}

    const internal = vm.$ || vm
    if (!internal) return {}

    let targetFn: any

    // 1. internal.render (解包标记)
    const instanceRender = internal.render
    if (typeof instanceRender === 'function') {
      try {
        const original = (instanceRender as any)[ORIGINAL_RENDER_PROP]
        if (typeof original === 'function') {
          targetFn = original
        } else {
          targetFn = instanceRender
        }
      } catch {
        targetFn = instanceRender
      }
    }

    // 2. internal.type.render 回落
    if (!targetFn && typeof internal.type?.render === 'function') {
      targetFn = internal.type.render
    }

    // 3. internal.type.setup 回落
    if (!targetFn && typeof internal.type?.setup === 'function') {
      targetFn = internal.type.setup
    }

    if (typeof targetFn !== 'function') return {}

    const raw = targetFn.toString()
    if (typeof raw !== 'string') return {}

    return { code: normalizeFunctionIndentation(raw) }
  } catch {
    return {}
  }
}
