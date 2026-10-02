/**
 * 镜像类型：NetworkRecord / NetworkSharedState
 * 真源见 packages/devframe/src/types.ts（冻结契约，字面量两端同步）
 */

export type NetworkRecordType = 'request' | 'upload' | 'download'

export interface NetworkRecord {
  /** 探针侧进程内单调递增序号（跨重连不重置）；node merge 与面板增量都以它对齐 */
  id: number
  type: NetworkRecordType
  /** GET/POST/...；upload/download 无 method 参数，恒 'POST' */
  method: string
  url: string
  /** 发起时所在页面路由（getCurrentPages 栈顶，取不到省略） */
  page?: string
  /** HTTP 状态码；网络层失败（fail 回调）为 0 */
  status: number
  /** 预留：HTTP 状态文案。mp 运行时拿不到，探针不填；失败语义看 error 字段 */
  statusText?: string
  requestHeaders?: Record<string, string>
  responseHeaders?: Record<string, string>
  /** 请求体：request=data 原样；upload={filePath,name,formData}；download 无 */
  requestBody?: unknown
  /** 响应体：尝试 JSON.parse，失败保持 string；download 为 tempFilePath */
  responseBody?: unknown
  /** 超 MAX_NETWORK_BODY_CHARS 截断 */
  requestBodyTruncated?: boolean
  responseBodyTruncated?: boolean
  /** 估算字节数（string 长度 / JSON.stringify 长度）；download 为文件大小（拿不到省略） */
  responseSize?: number
  /** epoch ms（探针侧 Date.now()） */
  startTime: number
  /** ms（complete 时结算） */
  duration?: number
  /** success 回调触发且 statusCode < 400 */
  ok: boolean
  /** fail 回调的 errMsg 原文 */
  error?: string
  aborted?: boolean
}

export interface GetNetworkRecordsParams {
  sinceId?: number
  limit?: number
}

export interface GetNetworkRecordsResult {
  records: NetworkRecord[]
  latestId: number
}

export interface ClearNetworkRecordsResult {
  ok: boolean
}

export interface NetworkSharedState {
  records: NetworkRecord[]
  latestId: number
  updatedAt: number
}

export interface UniNetworkApi {
  /** 缓存快照（按 id 升序） */
  getRecords(): NetworkRecord[]
  /** 清空请求记录（调用 node / 探针 clear-network-records） */
  clear(): Promise<void>
  /** 订阅记录变更（包含初始立即回调一次快照，返回退订函数） */
  subscribe(cb: (records: NetworkRecord[]) => void): () => void
}
