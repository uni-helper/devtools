/**
 * 探针侧网络请求采集器（agent/network.ts）
 *
 * 包装 uni 层三个网络 API（request / uploadFile / downloadFile）采集真实网络
 * 请求为 NetworkRecord，环形缓冲区持有，防抖增量推送到 node 侧 sharedState。
 *
 * 拦截层级定案与证据（边界说明）：
 * 只包 uni.* 三个 API，不碰 wx.*。
 * 证据（playground 产物 vendor.js 实测）：
 * uni mp 运行时在 vendor 求值期 initWx() 拷贝 newWx[key] = wx[key]、
 * initUni(shims, protocols, wx) 固化 API 引用——探针注入（main.ts）晚于该时刻，事后
 * 补丁 wx.request 拦不住 uni.request（漏记）；而 uni 是 Proxy，对 uni.request = wrapper
 * 赋值落 target 自有属性且 get 优先命中，单点无双记。直接 wx.request 调用
 * （非 uni-app 惯用法）不采集。
 *
 * 约束：
 * - 探针禁浏览器 API（window/document/location 由 eslint no-restricted-globals 执法）
 * - 禁 import devtools-kit 与 devframe/rpc 主入口
 * - 包装完全不改变原调用语义（回调式浅拷贝注入、Promise 式绝不注入回调原样透传返回值）
 * - 全程 try/catch 防御，插桩任何异常不得影响原请求
 */

import type {
  ClearNetworkRecordsResult,
  GetNetworkRecordsParams,
  GetNetworkRecordsResult,
  NetworkRecord,
  NetworkRecordType,
} from '../types.ts'

export const MAX_NETWORK_RING = 500
export const MAX_NETWORK_BODY_CHARS = 65536
export const PUSH_NETWORK_DEBOUNCE_MS = 500

const INTERCEPTED_FLAG = '__uni_devtools_network_intercepted__'

export interface NetworkDeps {
  getUni?: () => any
  getActiveInstance?: () => { rpc: any, socketHandle: { isConnected: () => boolean } } | null
  getCurrentRoute?: () => string | undefined
}

const ringBuffer: NetworkRecord[] = []
// id 基数取模块加载时刻（≈进程启动）：mp 重编译会整段重载探针上下文，若从 1
// 重新计数，新记录会撞 node 侧 sharedState 里上一轮的同 id 旧记录、被幂等
// merge 当重复吞掉。取时间戳基数让两轮 id 空间天然隔离（单测经
// __resetNetworkForTest 回到确定性小 id）。
let nextRecordId = Date.now()
let lastPushedId = 0
// 完成态补推脏集：记录创建时（pending 快照）可能随其他请求触发的批次先被推出、
// id 记入水位，等它完成时 id 已 ≤ lastPushedId，只按「id 越过水位」过滤永远推
// 不出去——node 侧停在 status=0 的 pending 快照上，面板误显示 FAIL（真机复现：
// 先行发起的请求全部 FAIL、后发起的正常显示）。终态结算与新建记录都
// 记脏，推送成功后出清。
const dirtyPushIds = new Set<number>()
let pushTimer: any = null
let networkDeps: NetworkDeps | null = null

declare const getCurrentPages: any
declare const uni: any

function defaultGetUni(): any {
  if (typeof uni !== 'undefined') {
    return uni
  }
  if (typeof globalThis !== 'undefined' && (globalThis as any).uni) {
    return (globalThis as any).uni
  }
  return undefined
}

function getPagePath(): string | undefined {
  try {
    if (networkDeps?.getCurrentRoute) {
      const r = networkDeps.getCurrentRoute()
      if (r) {
        return r.startsWith('/') ? r : `/${r}`
      }
      return undefined
    }

    const getPages = typeof getCurrentPages === 'function'
      ? getCurrentPages
      : (typeof globalThis !== 'undefined' && typeof (globalThis as any).getCurrentPages === 'function'
          ? (globalThis as any).getCurrentPages
          : undefined)
    if (!getPages) {
      return undefined
    }
    const pages = getPages()
    if (!Array.isArray(pages) || pages.length === 0) {
      return undefined
    }
    const top = pages[pages.length - 1]
    const rawRoute = top?.route || top?.__route__ || ''
    if (!rawRoute) {
      return undefined
    }
    return rawRoute.startsWith('/') ? rawRoute : `/${rawRoute}`
  }
  catch {
    return undefined
  }
}

function normalizeHeaders(header: any): Record<string, string> | undefined {
  if (!header || typeof header !== 'object') {
    return undefined
  }
  return { ...header }
}

function processRequestBody(type: NetworkRecordType, options: any): {
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
  }
  else {
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
    }
    catch {
      return { body: rawBody }
    }
  }

  return { body: rawBody }
}

function processResponseBody(type: NetworkRecordType, res: any): {
  body?: unknown
  truncated?: boolean
  size?: number
} {
  if (type === 'download') {
    const tempFilePath = res?.tempFilePath
    if (tempFilePath === undefined) {
      return {}
    }
    if (typeof tempFilePath === 'string' && tempFilePath.length > MAX_NETWORK_BODY_CHARS) {
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
    }
    catch {
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
    }
    catch {
      return { body: rawData }
    }
  }

  const str = String(rawData)
  return {
    body: rawData,
    size: str.length,
  }
}

function createPendingRecord(type: NetworkRecordType, options: any): NetworkRecord {
  const id = nextRecordId++

  let method = 'GET'
  if (type === 'upload' || type === 'download') {
    method = 'POST'
  }
  else if (options?.method) {
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

function handleSuccess(record: NetworkRecord, res: any, type: NetworkRecordType): void {
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
  const errMsg = typeof err === 'string'
    ? err
    : (err?.errMsg || err?.message || String(err || 'fail'))
  record.error = errMsg
  if (/abort/i.test(errMsg)) {
    record.aborted = true
  }
}

function handleFallbackFromComplete(record: NetworkRecord, res: any, type: NetworkRecordType): void {
  if (res && typeof res.statusCode === 'number') {
    handleSuccess(record, res, type)
  }
  else if (res && (res.errMsg || res.message)) {
    handleFail(record, res)
  }
  else {
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

    const hasCallback = typeof options.success === 'function'
      || typeof options.fail === 'function'
      || typeof options.complete === 'function'

    let record: NetworkRecord | null = null
    try {
      record = createPendingRecord(type, options)
    }
    catch {}

    if (hasCallback) {
      const wrappedOptions: any = { ...options }
      let successHandled = false
      let failHandled = false

      wrappedOptions.success = function (this: any, ...args: any[]) {
        try {
          if (record && !successHandled) {
            successHandled = true
            handleSuccess(record, args[0], type)
          }
        }
        catch {}
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
        }
        catch {}
        if (typeof options.fail === 'function') {
          return options.fail.apply(this, args)
        }
      }

      wrappedOptions.complete = function (this: any, ...args: any[]) {
        try {
          if (record) {
            if (!successHandled && !failHandled) {
              handleFallbackFromComplete(record, args[0], type)
            }
            handleComplete(record)
          }
        }
        catch {}
        if (typeof options.complete === 'function') {
          return options.complete.apply(this, args)
        }
      }

      try {
        return orig.call(this, wrappedOptions, ...rest)
      }
      catch (e) {
        try {
          if (record) {
            handleFail(record, e)
            handleComplete(record)
          }
        }
        catch {}
        throw e
      }
    }
    else {
      let result: any
      try {
        result = orig.call(this, options, ...rest)
      }
      catch (e) {
        try {
          if (record) {
            handleFail(record, e)
            handleComplete(record)
          }
        }
        catch {}
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
            }
            catch {}
          },
          (err: any) => {
            try {
              if (record) {
                handleFail(record, err)
                handleComplete(record)
              }
            }
            catch {}
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

  const uniObj = networkDeps?.getUni?.() || defaultGetUni()
  if (!uniObj) {
    return
  }

  const methods: Array<{ name: 'request' | 'uploadFile' | 'downloadFile', type: NetworkRecordType }> = [
    { name: 'request', type: 'request' },
    { name: 'uploadFile', type: 'upload' },
    { name: 'downloadFile', type: 'download' },
  ]

  for (const { name, type } of methods) {
    const orig = uniObj[name]
    if (typeof orig === 'function' && !orig[INTERCEPTED_FLAG]) {
      uniObj[name] = wrapNetworkMethod(type, orig)
    }
  }
}

export function getNetworkRecords(params?: GetNetworkRecordsParams | any): GetNetworkRecordsResult {
  let effectiveParams = params
  if (typeof params === 'string') {
    try {
      effectiveParams = JSON.parse(params)
    }
    catch {
      effectiveParams = {}
    }
  }

  const sinceId = effectiveParams && typeof effectiveParams === 'object' && effectiveParams.sinceId !== undefined
    ? Number(effectiveParams.sinceId)
    : (typeof effectiveParams === 'number' ? effectiveParams : undefined)

  let limit = effectiveParams && typeof effectiveParams === 'object' && effectiveParams.limit !== undefined
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
    candidates = candidates.filter(r => r.id > sinceId)
  }

  const records = candidates.length > limit
    ? candidates.slice(candidates.length - limit)
    : candidates.slice()

  const latestId = ringBuffer.length > 0
    ? ringBuffer[ringBuffer.length - 1].id
    : 0

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

  // 环形淘汰的脏 id 不再追：记录已出局，推送无主可寻
  if (dirtyPushIds.size > 0) {
    const ringIds = new Set(ringBuffer.map(r => r.id))
    for (const id of dirtyPushIds) {
      if (!ringIds.has(id)) {
        dirtyPushIds.delete(id)
      }
    }
  }

  const incremental = ringBuffer.filter(r => r.id > lastPushedId || dirtyPushIds.has(r.id))
  if (incremental.length === 0) {
    return
  }

  const maxId = incremental[incremental.length - 1].id
  const pushedIds = incremental.map(r => r.id)

  try {
    await instance.rpc.$call('uni-helper-devtools:push-network-records', { records: incremental })
    lastPushedId = Math.max(lastPushedId, maxId)
    for (const id of pushedIds) {
      dirtyPushIds.delete(id)
    }
  }
  catch {}
}

export function __resetNetworkForTest(): void {
  ringBuffer.length = 0
  nextRecordId = 1
  lastPushedId = 0
  dirtyPushIds.clear()
  cancelScheduledNetworkPush()
  networkDeps = null
}

export function __getLastPushedIdForTest(): number {
  return lastPushedId
}

export function __getRingBufferForTest(): NetworkRecord[] {
  return ringBuffer
}
