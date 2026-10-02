import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MAX_NETWORK_BODY_CHARS,
  MAX_NETWORK_RING,
  PUSH_NETWORK_DEBOUNCE_MS,
  __getLastPushedIdForTest,
  __getRingBufferForTest,
  __resetNetworkForTest,
  clearNetworkRecords,
  getNetworkRecords,
  installNetworkInterceptors,
  pushNetworkRecordsNow,
  resetNetworkPushState,
} from '../src/agent/network.ts'

describe('network: 探针网络采集器', () => {
  let fakeUni: any
  let requestHandler: any
  let uploadHandler: any
  let downloadHandler: any

  beforeEach(() => {
    vi.useRealTimers()
    __resetNetworkForTest()

    requestHandler = (options: any) => {
      if (options && (options.success || options.fail || options.complete)) {
        return { abort: vi.fn(), name: 'fakeRequestTask' }
      }
      return Promise.resolve({ statusCode: 200, data: 'default-promise-data' })
    }

    uploadHandler = (options: any) => {
      if (options && (options.success || options.fail || options.complete)) {
        return { abort: vi.fn(), name: 'fakeUploadTask' }
      }
      return Promise.resolve({ statusCode: 200, data: '{"upload":"ok"}' })
    }

    downloadHandler = (options: any) => {
      if (options && (options.success || options.fail || options.complete)) {
        return { abort: vi.fn(), name: 'fakeDownloadTask' }
      }
      return Promise.resolve({ statusCode: 200, tempFilePath: '/tmp/download.file' })
    }

    fakeUni = {
      request(this: any, ...args: any[]) {
        return requestHandler.apply(this, args)
      },
      uploadFile(this: any, ...args: any[]) {
        return uploadHandler.apply(this, args)
      },
      downloadFile(this: any, ...args: any[]) {
        return downloadHandler.apply(this, args)
      },
    }

    installNetworkInterceptors({
      getUni: () => fakeUni,
      getCurrentRoute: () => '/pages/index/index',
    })
  })

  afterEach(() => {
    __resetNetworkForTest()
    vi.restoreAllMocks()
  })

  describe('1. 回调式调用与生命周期', () => {
    it('回调式 success：状态码、响应头、JSON.parse 响应体、响应大小与耗时结算', () => {
      const userSuccess = vi.fn()
      const userComplete = vi.fn()

      requestHandler = (opts: any) => {
        opts.success({
          statusCode: 200,
          data: '{"message":"hello","code":0}',
          header: { 'content-type': 'application/json' },
        })
        opts.complete({ statusCode: 200 })
        return { taskId: 'req-1' }
      }

      const ret = fakeUni.request({
        url: 'https://example.com/api/test',
        method: 'post',
        data: { query: 'test' },
        header: { authorization: 'Bearer token' },
        success: userSuccess,
        complete: userComplete,
      })

      expect(ret).toEqual({ taskId: 'req-1' })
      expect(userSuccess).toHaveBeenCalledTimes(1)
      expect(userComplete).toHaveBeenCalledTimes(1)

      const result = getNetworkRecords()
      expect(result.records.length).toBe(1)
      const rec = result.records[0]

      expect(rec.id).toBe(1)
      expect(rec.type).toBe('request')
      expect(rec.method).toBe('POST')
      expect(rec.url).toBe('https://example.com/api/test')
      expect(rec.page).toBe('/pages/index/index')
      expect(rec.status).toBe(200)
      expect(rec.ok).toBe(true)
      expect(rec.requestHeaders).toEqual({ authorization: 'Bearer token' })
      expect(rec.responseHeaders).toEqual({ 'content-type': 'application/json' })
      expect(rec.requestBody).toEqual({ query: 'test' })
      expect(rec.responseBody).toEqual({ message: 'hello', code: 0 })
      expect(rec.responseSize).toBe('{"message":"hello","code":0}'.length)
      expect(typeof rec.duration).toBe('number')
      expect(rec.duration).toBeGreaterThanOrEqual(0)
    })

    it('回调式 fail：status=0, ok=false, error=errMsg', () => {
      const userFail = vi.fn()

      requestHandler = (opts: any) => {
        opts.fail({ errMsg: 'request:fail timeout' })
        opts.complete({ errMsg: 'request:fail timeout' })
      }

      fakeUni.request({
        url: 'https://example.com/api/timeout',
        fail: userFail,
      })

      expect(userFail).toHaveBeenCalledTimes(1)
      const rec = getNetworkRecords().records[0]
      expect(rec.status).toBe(0)
      expect(rec.ok).toBe(false)
      expect(rec.error).toBe('request:fail timeout')
      expect(rec.aborted).toBeUndefined()
    })

    it('回调式 abort：aborted=true 标记', () => {
      requestHandler = (opts: any) => {
        opts.fail({ errMsg: 'request:fail abort' })
        opts.complete({ errMsg: 'request:fail abort' })
      }

      fakeUni.request({
        url: 'https://example.com/api/abort',
        fail: () => {},
      })

      const rec = getNetworkRecords().records[0]
      expect(rec.status).toBe(0)
      expect(rec.ok).toBe(false)
      expect(rec.error).toBe('request:fail abort')
      expect(rec.aborted).toBe(true)
    })

    it('用户原 options 对象不被污染修改', () => {
      const originalOptions = {
        url: 'https://example.com/test',
        success: vi.fn(),
      }
      const keysBefore = Object.keys(originalOptions)

      requestHandler = (opts: any) => {
        opts.success({ statusCode: 200, data: 'ok' })
        opts.complete({})
      }

      fakeUni.request(originalOptions)

      expect(Object.keys(originalOptions)).toEqual(keysBefore)
      expect((originalOptions as any).fail).toBeUndefined()
      expect((originalOptions as any).complete).toBeUndefined()
    })

    it('用户回调被以原参数与 this 调用', () => {
      let callbackInvoked = false
      let capturedArg: any

      requestHandler = function (opts: any) {
        opts.success.call({ context: 'custom' }, { statusCode: 200, data: 'pass' })
      }

      fakeUni.request({
        url: 'https://example.com/this-test',
        success(this: any, arg: any) {
          callbackInvoked = true
          expect(this).toEqual({ context: 'custom' })
          capturedArg = arg
        },
      })

      expect(callbackInvoked).toBe(true)
      expect(capturedArg).toEqual({ statusCode: 200, data: 'pass' })
    })

    it('仅传 complete 未传 success/fail 时能正常结算', () => {
      requestHandler = (opts: any) => {
        opts.complete({ statusCode: 204 })
      }

      fakeUni.request({
        url: 'https://example.com/complete-only',
        complete: () => {},
      })

      const rec = getNetworkRecords().records[0]
      expect(rec.status).toBe(204)
      expect(rec.ok).toBe(true)
      expect(rec.duration).toBeGreaterThanOrEqual(0)
    })
  })

  describe('2. Promise 式调用与透传', () => {
    it('promise 式成功：绝不向 options 注入回调，返回原 promise', async () => {
      let passedOptions: any
      const mockPromise = Promise.resolve({
        statusCode: 200,
        data: '{"result":"success"}',
        header: { 'x-trace': '123' },
      })

      requestHandler = (opts: any) => {
        passedOptions = opts
        return mockPromise
      }

      const p = fakeUni.request({
        url: 'https://example.com/promise-ok',
        method: 'GET',
      })

      expect(p).toBe(mockPromise)
      expect(passedOptions.success).toBeUndefined()
      expect(passedOptions.fail).toBeUndefined()
      expect(passedOptions.complete).toBeUndefined()

      await p

      const rec = getNetworkRecords().records[0]
      expect(rec.status).toBe(200)
      expect(rec.ok).toBe(true)
      expect(rec.responseBody).toEqual({ result: 'success' })
      expect(rec.responseHeaders).toEqual({ 'x-trace': '123' })
    })

    it('promise 式 reject：记录 fail 且不改变原 rejection', async () => {
      const mockPromise = Promise.reject(new Error('network down'))
      requestHandler = () => mockPromise

      const p = fakeUni.request({
        url: 'https://example.com/promise-fail',
      })
      expect(p).toBe(mockPromise)

      await expect(p).rejects.toThrow('network down')

      const rec = getNetworkRecords().records[0]
      expect(rec.status).toBe(0)
      expect(rec.ok).toBe(false)
      expect(rec.error).toContain('network down')
    })

    it('同步抛错透传并不炸崩', () => {
      requestHandler = () => {
        throw new Error('invalid url format')
      }

      expect(() => {
        fakeUni.request({ url: '' })
      }).toThrow('invalid url format')

      const rec = getNetworkRecords().records[0]
      expect(rec.status).toBe(0)
      expect(rec.ok).toBe(false)
      expect(rec.error).toContain('invalid url format')
    })
  })

  describe('3. uploadFile 与 downloadFile 字段映射', () => {
    it('uploadFile：method 恒 POST、requestBody={filePath,name,formData}、responseBody 解析', () => {
      uploadHandler = (opts: any) => {
        opts.success({
          statusCode: 201,
          data: '{"fileId":"f-100"}',
        })
        opts.complete({})
        return { uploadTaskId: 'u-1' }
      }

      const ret = fakeUni.uploadFile({
        url: 'https://example.com/upload',
        filePath: '/tmp/avatar.png',
        name: 'file',
        formData: { user: 'test' },
        success: () => {},
      })

      expect(ret).toEqual({ uploadTaskId: 'u-1' })
      const rec = getNetworkRecords().records[0]
      expect(rec.type).toBe('upload')
      expect(rec.method).toBe('POST')
      expect(rec.requestBody).toEqual({
        filePath: '/tmp/avatar.png',
        name: 'file',
        formData: { user: 'test' },
      })
      expect(rec.responseBody).toEqual({ fileId: 'f-100' })
      expect(rec.status).toBe(201)
      expect(rec.ok).toBe(true)
    })

    it('downloadFile：method 恒 POST、无 requestBody、responseBody=tempFilePath、省略 responseSize', () => {
      downloadHandler = (opts: any) => {
        opts.success({
          statusCode: 200,
          tempFilePath: '/tmp/doc.pdf',
        })
        opts.complete({})
        return { downloadTaskId: 'd-1' }
      }

      const ret = fakeUni.downloadFile({
        url: 'https://example.com/file.pdf',
        success: () => {},
      })

      expect(ret).toEqual({ downloadTaskId: 'd-1' })
      const rec = getNetworkRecords().records[0]
      expect(rec.type).toBe('download')
      expect(rec.method).toBe('POST')
      expect(rec.requestBody).toBeUndefined()
      expect(rec.responseBody).toBe('/tmp/doc.pdf')
      expect(rec.responseSize).toBeUndefined()
      expect(rec.status).toBe(200)
      expect(rec.ok).toBe(true)
    })
  })

  describe('4. 响应体与请求体截断（MAX_NETWORK_BODY_CHARS = 65536）', () => {
    it('requestBody 字符串超长截断并标记 requestBodyTruncated', () => {
      const longBody = 'A'.repeat(MAX_NETWORK_BODY_CHARS + 100)

      fakeUni.request({
        url: 'https://example.com/long-body',
        data: longBody,
        complete: () => {},
      })

      const rec = getNetworkRecords().records[0]
      expect(rec.requestBody).toBe('A'.repeat(MAX_NETWORK_BODY_CHARS))
      expect(rec.requestBodyTruncated).toBe(true)
    })

    it('requestBody 对象序列化超长截断为字符串并标记', () => {
      const bigObject = { content: 'B'.repeat(MAX_NETWORK_BODY_CHARS + 50) }

      fakeUni.request({
        url: 'https://example.com/big-object',
        data: bigObject,
        complete: () => {},
      })

      const rec = getNetworkRecords().records[0]
      expect(typeof rec.requestBody).toBe('string')
      expect((rec.requestBody as string).length).toBe(MAX_NETWORK_BODY_CHARS)
      expect(rec.requestBodyTruncated).toBe(true)
    })

    it('responseBody 超长截断：即使是合法 JSON 也退回截断字符串', () => {
      const bigJson = JSON.stringify({
        data: 'C'.repeat(MAX_NETWORK_BODY_CHARS + 20),
      })

      requestHandler = (opts: any) => {
        opts.success({ statusCode: 200, data: bigJson })
        opts.complete({})
      }

      fakeUni.request({
        url: 'https://example.com/big-resp',
        success: () => {},
      })

      const rec = getNetworkRecords().records[0]
      expect(typeof rec.responseBody).toBe('string')
      expect((rec.responseBody as string).length).toBe(MAX_NETWORK_BODY_CHARS)
      expect(rec.responseBodyTruncated).toBe(true)
      expect(rec.responseSize).toBe(bigJson.length)
    })
  })

  describe('5. 环形缓冲、淘汰与拉取', () => {
    it('环形缓冲超容淘汰：第 501 条出局第 1 条', () => {
      requestHandler = (opts: any) => {
        if (opts.complete)
          opts.complete({})
      }

      for (let i = 1; i <= 501; i++) {
        fakeUni.request({
          url: `https://example.com/item/${i}`,
          complete: () => {},
        })
      }

      const ring = __getRingBufferForTest()
      expect(ring.length).toBe(MAX_NETWORK_RING)
      expect(ring[0].id).toBe(2)
      expect(ring[ring.length - 1].id).toBe(501)
    })

    it('getNetworkRecords 默认返回最近 200 条、latestId 正确', () => {
      requestHandler = (opts: any) => {
        if (opts.complete)
          opts.complete({})
      }

      for (let i = 1; i <= 250; i++) {
        fakeUni.request({
          url: `https://example.com/item/${i}`,
          complete: () => {},
        })
      }

      const res = getNetworkRecords()
      expect(res.records.length).toBe(200)
      expect(res.records[0].id).toBe(51)
      expect(res.records[199].id).toBe(250)
      expect(res.latestId).toBe(250)
    })

    it('getNetworkRecords sinceId 与 limit 控制', () => {
      requestHandler = (opts: any) => {
        if (opts.complete)
          opts.complete({})
      }

      for (let i = 1; i <= 50; i++) {
        fakeUni.request({
          url: `https://example.com/item/${i}`,
          complete: () => {},
        })
      }

      const sinceRes = getNetworkRecords({ sinceId: 40 })
      expect(sinceRes.records.length).toBe(10)
      expect(sinceRes.records.map(r => r.id)).toEqual([
        41,
        42,
        43,
        44,
        45,
        46,
        47,
        48,
        49,
        50,
      ])

      const limitRes = getNetworkRecords({ sinceId: 0, limit: 5 })
      expect(limitRes.records.length).toBe(5)
      expect(limitRes.records.map(r => r.id)).toEqual([46, 47, 48, 49, 50])

      // 字符串容错
      const strRes = getNetworkRecords('{"sinceId":45,"limit":3}')
      expect(strRes.records.length).toBe(3)
      expect(strRes.records.map(r => r.id)).toEqual([48, 49, 50])
    })

    it('clearNetworkRecords 清空缓冲且计数器不回退', () => {
      requestHandler = (opts: any) => {
        if (opts.complete)
          opts.complete({})
      }

      for (let i = 1; i <= 5; i++) {
        fakeUni.request({
          url: `https://example.com/${i}`,
          complete: () => {},
        })
      }

      expect(getNetworkRecords().records.length).toBe(5)
      expect(getNetworkRecords().latestId).toBe(5)

      const clearRes = clearNetworkRecords()
      expect(clearRes.ok).toBe(true)

      const emptyRes = getNetworkRecords()
      expect(emptyRes.records.length).toBe(0)
      expect(emptyRes.latestId).toBe(0)

      // 再发一条，id 必须是 6（不回退）
      fakeUni.request({
        url: 'https://example.com/next',
        complete: () => {},
      })

      const afterRes = getNetworkRecords()
      expect(afterRes.records.length).toBe(1)
      expect(afterRes.records[0].id).toBe(6)
      expect(afterRes.latestId).toBe(6)
    })
  })

  describe('6. 防抖推送与水位管理', () => {
    it('防抖批量：窗口内多次请求合并为一次推送', async () => {
      vi.useFakeTimers()

      const mockCall = vi.fn().mockResolvedValue({ ok: true })
      installNetworkInterceptors({
        getActiveInstance: () => ({
          rpc: { $call: mockCall },
          socketHandle: { isConnected: () => true },
        }),
      })

      requestHandler = (opts: any) => {
        opts.complete({})
      }

      fakeUni.request({ url: '/api/1', complete: () => {} })
      fakeUni.request({ url: '/api/2', complete: () => {} })
      fakeUni.request({ url: '/api/3', complete: () => {} })

      expect(mockCall).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(PUSH_NETWORK_DEBOUNCE_MS)

      expect(mockCall).toHaveBeenCalledTimes(1)
      expect(mockCall).toHaveBeenCalledWith(
        'uni-helper-devtools:push-network-records',
        expect.objectContaining({
          records: expect.arrayContaining([
            expect.objectContaining({ url: '/api/1' }),
            expect.objectContaining({ url: '/api/2' }),
            expect.objectContaining({ url: '/api/3' }),
          ]),
        }),
      )
      expect(__getLastPushedIdForTest()).toBe(3)
    })

    it('推送失败时水位不推进，下次重试', async () => {
      const mockCall = vi.fn().mockRejectedValueOnce(new Error('push fail'))

      installNetworkInterceptors({
        getActiveInstance: () => ({
          rpc: { $call: mockCall },
          socketHandle: { isConnected: () => true },
        }),
      })

      requestHandler = (opts: any) => {
        opts.complete({})
      }

      fakeUni.request({ url: '/api/fail-watermark', complete: () => {} })

      await pushNetworkRecordsNow()
      expect(mockCall).toHaveBeenCalledTimes(1)
      expect(__getLastPushedIdForTest()).toBe(0) // 水位未推进

      // 再次调用，这次成功
      mockCall.mockResolvedValueOnce({ ok: true })
      await pushNetworkRecordsNow()
      expect(mockCall).toHaveBeenCalledTimes(2)
      expect(__getLastPushedIdForTest()).toBe(1) // 成功后推进
    })

    it('resetNetworkPushState 重置水位为 0', async () => {
      const mockCall = vi.fn().mockResolvedValue({ ok: true })
      installNetworkInterceptors({
        getActiveInstance: () => ({
          rpc: { $call: mockCall },
          socketHandle: { isConnected: () => true },
        }),
      })

      requestHandler = (opts: any) => {
        opts.complete({})
      }

      fakeUni.request({ url: '/api/reset-1', complete: () => {} })
      await pushNetworkRecordsNow()
      expect(__getLastPushedIdForTest()).toBe(1)

      resetNetworkPushState()
      expect(__getLastPushedIdForTest()).toBe(0)

      await pushNetworkRecordsNow()
      // 全环重新推
      expect(mockCall).toHaveBeenCalledTimes(2)
      expect(__getLastPushedIdForTest()).toBe(1)
    })

    it('socket 未连接时跳过推送', async () => {
      const mockCall = vi.fn().mockResolvedValue({ ok: true })
      installNetworkInterceptors({
        getActiveInstance: () => ({
          rpc: { $call: mockCall },
          socketHandle: { isConnected: () => false },
        }),
      })

      requestHandler = (opts: any) => {
        opts.complete({})
      }

      fakeUni.request({ url: '/api/offline', complete: () => {} })
      await pushNetworkRecordsNow()
      expect(mockCall).not.toHaveBeenCalled()
    })
  })

  describe('7. 幂等安装与边界保护', () => {
    it('二次 install 不双包，且原函数仅调用一次', () => {
      const innerSpy = vi.fn((opts: any) => {
        if (opts.complete)
          opts.complete({})
      })
      fakeUni.request = innerSpy

      installNetworkInterceptors({ getUni: () => fakeUni })
      const wrappedOnce = fakeUni.request
      installNetworkInterceptors({ getUni: () => fakeUni })
      const wrappedTwice = fakeUni.request

      expect(wrappedOnce).toBe(wrappedTwice)

      fakeUni.request({ url: '/api/once', complete: () => {} })

      expect(innerSpy).toHaveBeenCalledTimes(1)
      expect(getNetworkRecords().records.length).toBe(1)
    })

    it('非对象 options 原样透传且不抛错', () => {
      requestHandler = () => 'non-object-ret'

      const ret = fakeUni.request(undefined)
      expect(ret).toBe('non-object-ret')
    })
  })
})
