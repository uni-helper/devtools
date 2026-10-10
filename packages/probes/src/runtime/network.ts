/**
 * 探针侧网络请求采集器（agent/network.ts）
 *
 * 包装 uni 层三个网络 API（request / uploadFile / downloadFile）采集真实网络
 * 请求为 NetworkRecord，环形缓冲区持有，防抖增量推送到 node 侧 sharedState。
 *
 * 拦截层级定案与证据（边界说明）：
 * 包 uni.* 三个 API（主目标）+ wx.* 三个 API（降级兼容，b38b993 起）。
 * 证据（@dcloudio/uni-mp-weixin@2.0.2 dist/wx.js、index.js 实读）：
 * uni.request 必须补 uni 本身——uni 是 Proxy，get trap 惰性读 wx[name]，
 * set trap 落 target 自有属性且 get 优先命中，单点无双记；补 wx 拦不住已通过
 * Proxy 固化的 uni 调用路径。直接 wx.request 调用（非 uni-app 惯用法）则靠
 * wx 降级补丁采集：wx.js 在 vendor 求值期把 globalThis.wx 整体替换为「拷贝出的
 * 新普通对象」（target['wx'] = initWx()），探针注入（main.js）晚于该时刻，
 * 此时 wx.request 是可写的普通属性——即使宿主基座原生 wx 方法只读（真机 iOS），
 * 拷贝出的对象也可直接赋值补丁。
 * 已知边界：业务代码若在 vendor 求值期（早于探针注入）以模块顶层
 * `const req = wx.request` 形式提前捕获原始引用，事后补丁覆盖不了已捕获引用
 * （见 test/network-wx-fallback.test.ts 边界用例）。
 *
 * 约束：
 * - 探针禁浏览器 API（window/document/location 由 eslint no-restricted-globals 执法）
 * - 禁 import devtools-kit 与 devframe/rpc 主入口
 * - 包装完全不改变原调用语义（回调式浅拷贝注入、Promise 式绝不注入回调原样透传返回值）
 * - 全程 try/catch 防御，插桩任何异常不得影响原请求
 */

import { NODE_RPC } from '@uni-helper/devtools-shared'
import type {
  ClearNetworkRecordsResult,
  GetNetworkRecordsParams,
  GetNetworkRecordsResult,
  NetworkRecord,
  NetworkRecordType,
} from '@uni-helper/devtools-shared'
import type { RuntimeAdapter } from '../adapter/types.ts'

export const MAX_NETWORK_RING = 500
export const MAX_NETWORK_BODY_CHARS = 65536
export const PUSH_NETWORK_DEBOUNCE_MS = 500

const INTERCEPTED_FLAG = '__uni_devtools_network_intercepted__'

export interface NetworkDeps {
  adapter?: RuntimeAdapter
  getUni?: () => any // 保留以兼容测试
  getActiveInstance?: () => {
    rpc: any
    socketHandle: { isConnected: () => boolean }
  } | null
  getCurrentRoute?: () => string | undefined
}

const ringBuffer: NetworkRecord[] = []
const GLOBAL_RECORD_ID_KEY = '__uni_devtools_network_next_id__'

function getGlobalRecordId(): number | undefined {
  if (
    typeof globalThis !== 'undefined' &&
    typeof (globalThis as any)[GLOBAL_RECORD_ID_KEY] === 'number'
  ) {
    return (globalThis as any)[GLOBAL_RECORD_ID_KEY]
  }
  return undefined
}

function setGlobalRecordId(id: number | undefined): void {
  if (typeof globalThis !== 'undefined') {
    if (id === undefined) {
      delete (globalThis as any)[GLOBAL_RECORD_ID_KEY]
    } else {
      ;(globalThis as any)[GLOBAL_RECORD_ID_KEY] = id
    }
  }
}

function initRecordId(): number {
  const globalId = getGlobalRecordId()
  if (globalId !== undefined) {
    return globalId
  }
  const initial = Date.now() * 1000
  setGlobalRecordId(initial)
  return initial
}

let nextRecordId = initRecordId()
let lastPushedId = 0
// 完成态补推脏集：记录创建时（pending 快照）可能随其他请求触发的批次先被推出、
// id 记入水位，等它完成时 id 已 ≤ lastPushedId，只按「id 越过水位」过滤永远推
// 不出去——node 侧停在 status=0 的 pending 快照上，面板误显示 FAIL（真机复现：
// 先行发起的请求全部 FAIL、后发起的正常显示）。终态结算与新建记录都
// 记脏，推送成功后出清。
const dirtyPushIds = new Set<number>()
let pushTimer: any = null
let networkDeps: NetworkDeps | null = null
let isPushing = false
let pushAgainRequested = false

function getPagePath(): string | undefined {
  try {
    if (networkDeps?.getCurrentRoute) {
      const r = networkDeps.getCurrentRoute()
      if (r) {
        return r.startsWith('/') ? r : `/${r}`
      }
      return undefined
    }

    // 通过 adapter 获取当前页面
    const adapter = networkDeps?.adapter
    if (adapter) {
      const pages = adapter.getCurrentPages()
      if (Array.isArray(pages) && pages.length > 0) {
        const top = pages[pages.length - 1]
        const rawRoute = top?.route || top?.__route__ || ''
        if (rawRoute) {
          return rawRoute.startsWith('/') ? rawRoute : `/${rawRoute}`
        }
      }
    }

    return undefined
  } catch {
    return undefined
  }
}

function normalizeHeaders(header: any): Record<string, string> | undefined {
  if (!header || typeof header !== 'object') {
    return undefined
  }
  return { ...header }
}

function processRequestBody(
  type: NetworkRecordType,
  options: any,
): {
  body?: unknown
  truncated?: boolean
} {
  if (type === 'download') {
    return {}
  }

  let rawBody: unknown
  if (type === 'upload') {
    rawBody = {
      filePath: options?.filePath,
      name: options?.name,
      formData: options?.formData,
    }
  } else {
    rawBody = options?.data
  }

  if (rawBody === undefined) {
    return {}
  }

  if (typeof rawBody === 'string') {
    if (rawBody.length > MAX_NETWORK_BODY_CHARS) {
      return {
        body: rawBody.slice(0, MAX_NETWORK_BODY_CHARS),
        truncated: true,
      }
    }
    return { body: rawBody }
  }

  if (typeof rawBody === 'object' && rawBody !== null) {
    try {
      const str = JSON.stringify(rawBody)
      if (str && str.length > MAX_NETWORK_BODY_CHARS) {
        return {
          body: str.slice(0, MAX_NETWORK_BODY_CHARS),
          truncated: true,
        }
      }
      return { body: rawBody }
    } catch {
      return { body: rawBody }
    }
  }

  return { body: rawBody }
}

function processResponseBody(
  type: NetworkRecordType,
  res: any,
): {
  body?: unknown
  truncated?: boolean
  size?: number
} {
  if (type === 'download') {
    const tempFilePath = res?.tempFilePath
    if (tempFilePath === undefined) {
      return {}
    }
    if (
      typeof tempFilePath === 'string' &&
      tempFilePath.length > MAX_NETWORK_BODY_CHARS
    ) {
      return {
        body: tempFilePath.slice(0, MAX_NETWORK_BODY_CHARS),
        truncated: true,
      }
    }
    return { body: tempFilePath }
  }

  const rawData = res?.data
  if (rawData === undefined) {
    return {}
  }

  if (typeof rawData === 'string') {
    const size = rawData.length
    let parsed: unknown = rawData
    let parseOk = false
    try {
      parsed = JSON.parse(rawData)
      parseOk = true
    } catch {
      parseOk = false
    }

    if (rawData.length > MAX_NETWORK_BODY_CHARS) {
      return {
        body: rawData.slice(0, MAX_NETWORK_BODY_CHARS),
        truncated: true,
        size,
      }
    }

    return {
      body: parseOk ? parsed : rawData,
      size,
    }
  }

  if (typeof rawData === 'object' && rawData !== null) {
    try {
      const str = JSON.stringify(rawData)
      const size = str ? str.length : 0
      if (str && str.length > MAX_NETWORK_BODY_CHARS) {
        return {
          body: str.slice(0, MAX_NETWORK_BODY_CHARS),
          truncated: true,
          size,
        }
      }
      return {
        body: rawData,
        size,
      }
    } catch {
      return { body: rawData }
    }
  }

  const str = String(rawData)
  return {
    body: rawData,
    size: str.length,
  }
}

function allocateNextRecordId(): number {
  const globalId = getGlobalRecordId()
  if (globalId !== undefined && globalId > nextRecordId) {
    nextRecordId = globalId
  }
  const id = nextRecordId++
  setGlobalRecordId(nextRecordId)
  return id
}

function createPendingRecord(
  type: NetworkRecordType,
  options: any,
): NetworkRecord {
  const id = allocateNextRecordId()

  let method = 'GET'
  if (type === 'upload' || type === 'download') {
    method = 'POST'
  } else if (options?.method) {
    method = String(options.method).toUpperCase()
  }

  const url = options?.url ? String(options.url) : ''

  const record: NetworkRecord = {
    id,
    type,
    method,
    url,
    status: 0,
    startTime: Date.now(),
    ok: false,
  }

  const page = getPagePath()
  if (page) {
    record.page = page
  }

  const reqHeaders = normalizeHeaders(options?.header)
  if (reqHeaders) {
    record.requestHeaders = reqHeaders
  }

  const { body, truncated } = processRequestBody(type, options)
  if (body !== undefined) {
    record.requestBody = body
  }
  if (truncated) {
    record.requestBodyTruncated = true
  }

  ringBuffer.push(record)
  if (ringBuffer.length > MAX_NETWORK_RING) {
    ringBuffer.shift()
  }
  dirtyPushIds.add(record.id)

  return record
}

function handleSuccess(
  record: NetworkRecord,
  res: any,
  type: NetworkRecordType,
): void {
  const status = typeof res?.statusCode === 'number' ? res.statusCode : 200
  record.status = status
  record.ok = status < 400

  const respHeaders = normalizeHeaders(res?.header)
  if (respHeaders) {
    record.responseHeaders = respHeaders
  }

  const { body, truncated, size } = processResponseBody(type, res)
  if (body !== undefined) {
    record.responseBody = body
  }
  if (truncated) {
    record.responseBodyTruncated = true
  }
  if (size !== undefined) {
    record.responseSize = size
  }
}

function handleFail(record: NetworkRecord, err: any): void {
  record.status = 0
  record.ok = false
  const errMsg =
    typeof err === 'string'
      ? err
      : err?.errMsg || err?.message || String(err || 'fail')
  record.error = errMsg
  if (/abort/i.test(errMsg)) {
    record.aborted = true
  }
}

function handleFallbackFromComplete(
  record: NetworkRecord,
  res: any,
  type: NetworkRecordType,
): void {
  if (res && typeof res.statusCode === 'number') {
    handleSuccess(record, res, type)
  } else if (res && (res.errMsg || res.message)) {
    handleFail(record, res)
  } else {
    record.status = 0
    record.ok = false
  }
}

function handleComplete(record: NetworkRecord): void {
  if (record.duration === undefined) {
    record.duration = Math.max(0, Date.now() - record.startTime)
  }
  dirtyPushIds.add(record.id)
  scheduleNetworkPush()
}

function wrapNetworkMethod(type: NetworkRecordType, orig: any): any {
  const wrapper = function (this: any, options?: any, ...rest: any[]) {
    if (!options || typeof options !== 'object') {
      return orig.call(this, options, ...rest)
    }

    const hasCallback =
      typeof options.success === 'function' ||
      typeof options.fail === 'function' ||
      typeof options.complete === 'function'

    let record: NetworkRecord | null = null
    try {
      record = createPendingRecord(type, options)
    } catch {}

    if (hasCallback) {
      const wrappedOptions: any = { ...options }
      let successHandled = false
      let failHandled = false
      let completeHandled = false

      wrappedOptions.success = function (this: any, ...args: any[]) {
        try {
          if (record && !successHandled) {
            successHandled = true
            handleSuccess(record, args[0], type)
          }
        } catch {}
        if (typeof options.success === 'function') {
          return options.success.apply(this, args)
        }
      }

      wrappedOptions.fail = function (this: any, ...args: any[]) {
        try {
          if (record && !failHandled) {
            failHandled = true
            handleFail(record, args[0])
          }
        } catch {}
        if (typeof options.fail === 'function') {
          return options.fail.apply(this, args)
        }
      }

      // 必须强制注入 complete 回调，确保 handleComplete 被调用
      // 即使用户没有提供 complete 回调，也要包装一个
      wrappedOptions.complete = function (this: any, ...args: any[]) {
        try {
          if (record && !completeHandled) {
            completeHandled = true
            if (!successHandled && !failHandled) {
              handleFallbackFromComplete(record, args[0], type)
            }
            handleComplete(record)
          }
        } catch {}
        if (typeof options.complete === 'function') {
          return options.complete.apply(this, args)
        }
      }

      try {
        return orig.call(this, wrappedOptions, ...rest)
      } catch (e) {
        try {
          if (record) {
            handleFail(record, e)
            handleComplete(record)
          }
        } catch {}
        throw e
      }
    } else {
      let result: any
      try {
        result = orig.call(this, options, ...rest)
      } catch (e) {
        try {
          if (record) {
            handleFail(record, e)
            handleComplete(record)
          }
        } catch {}
        throw e
      }

      if (result && typeof result.then === 'function') {
        result.then(
          (res: any) => {
            try {
              if (record) {
                handleSuccess(record, res, type)
                handleComplete(record)
              }
            } catch {}
          },
          (err: any) => {
            try {
              if (record) {
                handleFail(record, err)
                handleComplete(record)
              }
            } catch {}
          },
        )
      }

      return result
    }
  }

  wrapper[INTERCEPTED_FLAG] = true
  wrapper.__uni_devtools_original__ = orig
  return wrapper
}

export function installNetworkInterceptors(deps?: NetworkDeps): void {
  if (deps) {
    networkDeps = { ...networkDeps, ...deps }
  }

  const methods: Array<{
    name: 'request' | 'uploadFile' | 'downloadFile'
    type: NetworkRecordType
  }> = [
    { name: 'request', type: 'request' },
    { name: 'uploadFile', type: 'upload' },
    { name: 'downloadFile', type: 'download' },
  ]

  let totalInstalled = 0
  let alreadyInstalled = 0

  // 尝试拦截多个目标：uni（首选）和 wx（降级兼容）
  const targets: Array<{ obj: any; label: string }> = []

  // 1. 优先拦截 uni（标准 uni-app API）
  let uniObj: any
  if (networkDeps?.getUni) {
    uniObj = networkDeps.getUni()
  } else {
    uniObj = (globalThis as any).uni
  }
  if (uniObj) {
    targets.push({ obj: uniObj, label: 'uni' })
  }

  // 2. 降级拦截 wx（兼容直接使用 wx.request 的情况）；个别宿主会把 uni
  //    指向同一对象，同引用时跳过，避免重复遍历
  const wxObj = (globalThis as any).wx
  if (wxObj && wxObj !== uniObj) {
    targets.push({ obj: wxObj, label: 'wx' })
  }

  if (targets.length === 0) {
    console.warn(
      '[uni-devtools:network] No uni/wx runtime available, network interception disabled',
    )
    return
  }

  // 对每个目标对象安装拦截器
  for (const target of targets) {
    let installedCount = 0
    let skippedCount = 0

    for (const { name, type } of methods) {
      const orig = target.obj[name]

      if (typeof orig !== 'function') {
        // 方法缺失：两条真实运行时线（新版 wx.js 替换 / 老版原生 wx）在探针
        // 注入时三个 API 均已就绪，且运行时不会事后向 uni.* 赋值（uni Proxy
        // 惰性解析）。不做延迟监听——对 uni Proxy 执行 defineProperty 会在
        // target 留下自有 accessor，永久遮蔽 get trap 的惰性 API 解析。
        continue
      }

      if (orig[INTERCEPTED_FLAG]) {
        // 已装过（重复 install：HMR / 多页面重入），计入幂等避免误报
        skippedCount++
        continue
      }

      const wrapper = wrapNetworkMethod(type, orig)

      // 直接赋值可能失败：老版 uni 运行时（无 wx.js 替换）下探针面对的是
      // 宿主基座原生 wx 对象，其方法属性可能只读（真机）。strict mode 下
      // 赋值抛 TypeError、sloppy mode 下静默不生效——两种都要兜住，且
      // 绝不能让单个属性的失败把整个安装流程炸掉（否则 uni 侧已装好的
      // 拦截器随 initAgentPipeline 一起报废，agent 降级为 stub）。
      let installed = false
      try {
        target.obj[name] = wrapper
        installed = target.obj[name] === wrapper
      } catch {
        installed = false
      }

      if (!installed) {
        // 赋值失败降级 defineProperty：对「只读但 configurable」的属性仍可生效
        try {
          Object.defineProperty(target.obj, name, {
            configurable: true,
            writable: true,
            enumerable: true,
            value: wrapper,
          })
          installed = true
        } catch {
          console.warn(
            `[uni-devtools:network] Cannot intercept ${target.label}.${name}: property is read-only/non-configurable`,
          )
        }
      }

      if (installed) {
        installedCount++
      }
    }

    totalInstalled += installedCount
    alreadyInstalled += skippedCount

    // 输出每个目标的安装结果
    if (installedCount > 0) {
      console.log(
        `[uni-devtools:network] Installed ${installedCount} interceptors on ${target.label}`,
      )
    }
  }

  // 输出总体结果：全部已装过（幂等重入）不算异常
  if (totalInstalled === 0 && alreadyInstalled === 0) {
    console.warn(
      '[uni-devtools:network] No network methods found on uni/wx, interception may not work',
    )
  }
}

export function getNetworkRecords(
  params?: GetNetworkRecordsParams | any,
): GetNetworkRecordsResult {
  let effectiveParams = params
  if (typeof params === 'string') {
    try {
      effectiveParams = JSON.parse(params)
    } catch {
      effectiveParams = {}
    }
  }

  const sinceId =
    effectiveParams &&
    typeof effectiveParams === 'object' &&
    effectiveParams.sinceId !== undefined
      ? Number(effectiveParams.sinceId)
      : typeof effectiveParams === 'number'
        ? effectiveParams
        : undefined

  let limit =
    effectiveParams &&
    typeof effectiveParams === 'object' &&
    effectiveParams.limit !== undefined
      ? Number(effectiveParams.limit)
      : 200
  if (Number.isNaN(limit) || limit <= 0) {
    limit = 200
  }
  if (limit > MAX_NETWORK_RING) {
    limit = MAX_NETWORK_RING
  }

  let candidates = ringBuffer
  if (sinceId !== undefined && !Number.isNaN(sinceId)) {
    candidates = candidates.filter((r) => r.id > sinceId)
  }

  const records =
    candidates.length > limit
      ? candidates.slice(candidates.length - limit)
      : candidates.slice()

  const latestId =
    ringBuffer.length > 0 ? ringBuffer[ringBuffer.length - 1].id : 0

  return {
    records,
    latestId,
  }
}

export function clearNetworkRecords(): ClearNetworkRecordsResult {
  ringBuffer.length = 0
  dirtyPushIds.clear()
  return { ok: true }
}

export function resetNetworkPushState(): void {
  lastPushedId = 0
}

export function cancelScheduledNetworkPush(): void {
  if (pushTimer) {
    clearTimeout(pushTimer)
    pushTimer = null
  }
}

export function scheduleNetworkPush(delay = PUSH_NETWORK_DEBOUNCE_MS): void {
  // 已有待发批次时保持最早截止期，不再顺延：轮询型页面请求间隔若恒小于防抖
  // 窗口，「每次完成都重置计时器」会让推送无限饿死（首笔后固定窗口到期即发，
  // 窗口内后续完成自然并入同一批——ring 按 id 增量取数，不吃亏）。
  if (pushTimer) {
    return
  }
  pushTimer = setTimeout(() => {
    pushTimer = null
    pushNetworkRecordsNow().catch(() => {})
  }, delay)
}

export async function pushNetworkRecordsNow(): Promise<void> {
  const instance = networkDeps?.getActiveInstance?.()
  if (!instance || !instance.socketHandle?.isConnected?.()) {
    return
  }

  // 1. 并发锁控制：如果当前已有推送在进行，标记需要再次推送并退出
  if (isPushing) {
    pushAgainRequested = true
    return
  }
  isPushing = true
  pushAgainRequested = false

  try {
    // 2. 清理已被环形缓冲区淘汰的脏 ID（优化：避免 Set(map) 分配开销）
    if (dirtyPushIds.size > 0 && ringBuffer.length > 0) {
      const oldestRingId = ringBuffer[0].id
      const newestRingId = ringBuffer[ringBuffer.length - 1].id
      for (const id of dirtyPushIds) {
        if (id < oldestRingId || id > newestRingId) {
          dirtyPushIds.delete(id)
        }
      }
    }

    // 3. 提取增量记录
    const incremental = ringBuffer.filter(
      (r) => r.id > lastPushedId || dirtyPushIds.has(r.id),
    )
    if (incremental.length === 0) {
      return
    }

    const maxId = incremental[incremental.length - 1].id
    const pushedIds = incremental.map((r) => r.id)

    // 4. 关键：创建浅拷贝快照，避免网络序列化期间被事件回调原地篡改
    const recordsSnapshot = incremental.map((r) => ({ ...r }))

    // 5. 关键：在 await 之前预出清本次推送涉及的脏 ID！
    // 如果在 await 期间某个请求从 pending 变为 complete，
    // handleComplete 会再次调用 dirtyPushIds.add(id)，不会被后续逻辑覆盖抹掉！
    for (const id of pushedIds) {
      dirtyPushIds.delete(id)
    }

    try {
      await instance.rpc.$call(NODE_RPC.pushNetworkRecords, {
        records: recordsSnapshot,
      })
      lastPushedId = Math.max(lastPushedId, maxId)
    } catch {
      // 推送失败回滚：将本次推送的 ID 重新加回脏集
      for (const id of pushedIds) {
        dirtyPushIds.add(id)
      }
    }
  } finally {
    isPushing = false

    // 6. 如果在推送执行期间收到了新的推送请求，或者仍有未出清的脏数据，顺延调度下一次推送
    if (pushAgainRequested || dirtyPushIds.size > 0) {
      scheduleNetworkPush()
    }
  }
}

export function __resetNetworkForTest(): void {
  ringBuffer.length = 0
  nextRecordId = 1
  setGlobalRecordId(1)
  lastPushedId = 0
  dirtyPushIds.clear()
  cancelScheduledNetworkPush()
  networkDeps = null
  isPushing = false
  pushAgainRequested = false
}

export function __initRecordIdForReloadTest(): void {
  nextRecordId = initRecordId()
}

export function __getLastPushedIdForTest(): number {
  return lastPushedId
}

export function __getRingBufferForTest(): NetworkRecord[] {
  return ringBuffer
}
