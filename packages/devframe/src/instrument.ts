/**
 * 编译期插桩（dev 专用，enforce post）
 *
 * 背景：uni-app mp 构建丢了两类信息，让面板退化——
 * 1. 组件源文件路径不进产物：plain `<script>` SFC / layout 编译后既无
 *    `__name` 也无 `__file`（script setup 才有 `defineComponent({__name})`），
 *    树里只剩 `<Anonymous>`
 * 2. script setup 的绑定被编译器内联进 render 闭包：`setup()` 直接返回
 *    render 函数而非 bindings 对象，运行时 `setupState` 是空对象——
 *    连 uni 官方 vue-devtools 也拿不到（运行时 `devtoolsRawSetupState`
 *    在函数分支不赋值，见 uni-mp-vue handleSetupResult）
 *
 * 对策（都在编译产物上补，运行时探针只读现成字段，不做运行时分析）：
 * 1. `uniComponent://` / `uniPage://` 虚拟入口（uni-mp-vite entry.js 生成，
 *    形态固定两行：`import Component from '...'; <global>.createComponent(Component)`）
 *    在 createComponent 调用前注入 `__file` 守卫——入口 id 的 base64url
 *    可解码回源文件路径（与 entry.js 自身的 path.resolve 语义一致）
 * 2. 组件模块里「setup 返回函数」的编译形态，改写末尾 return 为
 *    `return Object.assign(renderFn, { __uni_devtools_bindings__: { 绑定名... } })`。
 *    绑定对象持有闭包变量的引用（ref/reactive 为同一引用，读值天然是活值）；
 *    每次 setup 调用生成新 render 函数 → 每个实例各自一份绑定，互不串扰
 *
 * 冻结契约（见 HANDOFF §4）：
 * - 属性名 `__uni_devtools_bindings__` 单点定义于 shared/contracts.ts，写读两端同一导入
 * - `__file` 的兜底命名与 `agent/tree.ts` 的 getComponentDisplayName 一致
 */
import { Buffer } from 'node:buffer'
import path from 'node:path'
import process from 'node:process'

import { BINDINGS_PROP } from './shared/contracts.ts'

export { BINDINGS_PROP }

const FILE_MARKER = '__uni_devtools_file__'
const UNI_COMPONENT_PREFIX = 'uniComponent://'
const UNI_PAGE_PREFIX = 'uniPage://'
/** agent 侧渲染钩子（子路径导出，package.json exports 同步） */
const RENDER_HOOK_IMPORT = '@uni-helper/devtools-devframe/agent/render-hook'
const RENDER_HOOK_FN = '__uni_devtools_notify_render'
const RENDER_HOOK_IMPORT_LINE = `import { __uniDevtoolsNotifyRender as ${RENDER_HOOK_FN} } from '${RENDER_HOOK_IMPORT}'`

/**
 * plain `<script>` 形态（render 在模块层经 _export_sfc 挂载）的渲染钩子包装：
 * `_export_sfc(main, [["render", _sfc_render]])` → 包装 _sfc_render 引用。
 * 已带钩子导入标记的模块跳过（setup 形态已注入过 import）。
 */
export function injectPlainRenderHook(code: string): string | null {
  if (!code.includes('_export_sfc') || code.includes(RENDER_HOOK_FN))
    return null
  const re = /\[\s*["']render["']\s*,\s*([A-Za-z_$][\w$]*)\s*\]/
  const match = code.match(re)
  if (!match)
    return null
  const wrapped = code.replace(re, `["render", ${RENDER_HOOK_FN}(${match[1]})]`)
  return `${RENDER_HOOK_IMPORT_LINE}\n${wrapped}`
}

/** 虚拟入口 id → 相对 UNI_INPUT_DIR 的源文件路径（解码失败/无 inputDir 时退回绝对路径） */
export function resolveVirtualEntryFile(id: string): string | undefined {
  const prefix = id.startsWith(UNI_COMPONENT_PREFIX)
    ? UNI_COMPONENT_PREFIX
    : id.startsWith(UNI_PAGE_PREFIX)
      ? UNI_PAGE_PREFIX
      : undefined
  if (!prefix)
    return undefined

  // Node 的 base64 解码接受 base64url 变体（无 padding）
  const decoded = Buffer.from(id.slice(prefix.length), 'base64').toString('utf8')
  if (!decoded)
    return undefined

  const inputDir = process.env.UNI_INPUT_DIR
  if (!inputDir)
    return decoded
  return path.relative(inputDir, path.resolve(inputDir, decoded)) || decoded
}

/**
 * 虚拟入口注入 `__file` 守卫（createComponent/createPage 之前）。
 * 入口代码形态固定，直接锚定末尾的全局对象调用；守卫带 marker 防重复注入。
 */
export function injectEntryFileGuard(code: string, file: string): string | null {
  if (code.includes(FILE_MARKER))
    return null
  const call = code.match(/([A-Za-z_$][\w$]*)\.create(?:Component|Page)\(\s*([A-Za-z_$][\w$]*)\s*\)[\s;]*$/)
  if (!call || call.index === undefined)
    return null
  const target = call[2]!
  const guard = `/* ${FILE_MARKER} */ if (${target} && !${target}.__file) { ${target}.__file = ${JSON.stringify(file)}; }\n`
  return code.slice(0, call.index) + guard + code.slice(call.index)
}

/** 收集声明模式里的绑定名（Identifier / 解构 / rest / 带默认值） */
function collectDeclaredNames(pattern: any, out: Set<string>): void {
  if (!pattern || typeof pattern !== 'object')
    return
  switch (pattern.type) {
    case 'Identifier':
      out.add(pattern.name)
      break
    case 'ObjectPattern':
      for (const prop of pattern.properties ?? []) {
        if (prop.type === 'Property')
          collectDeclaredNames(prop.value, out)
        else if (prop.type === 'RestElement')
          collectDeclaredNames(prop.argument, out)
      }
      break
    case 'ArrayPattern':
      for (const el of pattern.elements ?? []) {
        if (el)
          collectDeclaredNames(el, out)
      }
      break
    case 'AssignmentPattern':
      collectDeclaredNames(pattern.left, out)
      break
    case 'RestElement':
      collectDeclaredNames(pattern.argument, out)
      break
  }
}

/** AST 深遍历（跳过位置字段；对形状不符的输入安全失败） */
function visit(node: unknown, visitFn: (node: any) => void): void {
  if (!node || typeof node !== 'object')
    return
  if (Array.isArray(node)) {
    for (const item of node)
      visit(item, visitFn)
    return
  }
  if (typeof (node as any).type !== 'string')
    return
  visitFn(node)
  for (const key of Object.keys(node)) {
    if (key !== 'type' && key !== 'start' && key !== 'end' && key !== 'loc')
      visit((node as any)[key], visitFn)
  }
}

interface SetupCapture {
  returnStart: number
  returnEnd: number
  /** render 函数表达式区间（return 语句内） */
  argStart: number
  argEnd: number
  names: string[]
}

/**
 * 对「setup 返回 render 函数」的 mp 编译形态注入闭包绑定捕获。
 *
 * 只改 setup 顶层末尾的 `return <fn 表达式>;` 一处；绑定名取 setup 顶层
 * 声明（var/let/const/function/class，含解构）。编译器内部量（`__props`、
 * `__emit` 等 `__`/`$` 前缀）与被编译器提升到模块层的纯常量不在此列——
 * 前者非用户状态，后者是静态常量，取舍记录于模块头注释。
 * 解析或形状不符一律返回 null（原样放行，绝不因插桩炸构建）。
 */
export function injectSetupBindings(
  code: string,
  parse: (source: string) => any,
): string | null {
  if (!code.includes('setup') || code.includes(BINDINGS_PROP))
    return null

  let ast: any
  try {
    ast = parse(code)
  }
  catch {
    return null
  }

  const captures: SetupCapture[] = []

  visit(ast, (node) => {
    if (node.type !== 'Property' || node.computed)
      return
    const key = node.key
    if (!key || key.type !== 'Identifier' || key.name !== 'setup')
      return
    const fn = node.value
    if (!fn || (fn.type !== 'FunctionExpression' && fn.type !== 'ArrowFunctionExpression') || fn.async)
      return
    const body = fn.body
    if (!body || body.type !== 'BlockStatement')
      return

    const names = new Set<string>()
    let renderReturn: any
    for (const stmt of body.body ?? []) {
      if (stmt.type === 'VariableDeclaration') {
        for (const decl of stmt.declarations ?? [])
          collectDeclaredNames(decl.id, names)
      }
      else if (stmt.type === 'FunctionDeclaration' || stmt.type === 'ClassDeclaration') {
        if (stmt.id)
          names.add(stmt.id.name)
      }
      else if (stmt.type === 'ReturnStatement' && !renderReturn) {
        const arg = stmt.argument
        if (arg && (arg.type === 'FunctionExpression' || arg.type === 'ArrowFunctionExpression') && !arg.async)
          renderReturn = stmt
      }
    }
    if (!renderReturn || names.size === 0)
      return

    const bindingNames = [...names].filter(name => !name.startsWith('__') && !name.startsWith('$'))
    if (bindingNames.length === 0)
      return
    captures.push({
      returnStart: renderReturn.start,
      returnEnd: renderReturn.end,
      argStart: renderReturn.argument.start,
      argEnd: renderReturn.argument.end,
      names: bindingNames,
    })
  })

  if (captures.length === 0)
    return null

  // 从后往前替换，保持前序替换点偏移有效；嵌套 setup（setup 体内再定义
  // 带 setup 的对象字面量）会产生重叠替换区间，只保留最外层，内层静默放弃
  let cursor = Number.POSITIVE_INFINITY
  const ordered = captures
    .sort((a, b) => b.returnStart - a.returnStart)
    .filter((capture) => {
      if (capture.returnEnd > cursor)
        return false
      cursor = capture.returnStart
      return true
    })
  if (ordered.length === 0)
    return null

  let out = code
  for (const capture of ordered) {
    const arg = out.slice(capture.argStart, capture.argEnd)
    // 渲染钩子包装：渲染即调度树推送（钩子保 length 2，绑定量挂回包装层，
    // 探针读 internal.render[BINDINGS_PROP] 不受影响）
    const replacement = `return Object.assign(${RENDER_HOOK_FN}(${arg}), { ${BINDINGS_PROP}: { ${capture.names.join(', ')} } });`
    out = out.slice(0, capture.returnStart) + replacement + out.slice(capture.returnEnd)
  }
  return `${RENDER_HOOK_IMPORT_LINE}\n${out}`
}
