/**
 * wx 降级拦截回归测试：忠实模拟 vue2 webpack mp-weixin 运行时环境
 * （依据 @dcloudio/uni-mp-weixin@2.0.2-5020620260917001 的 dist/wx.js 与 dist/index.js）
 *
 * 运行时关键结构（拦截可行性的事实依据）：
 * 1. wx.js 在 vendor 求值期把 globalThis.wx 整体替换为「拷贝出的新普通对象」
 *    （target['wx'] = initWx()），因此探针注入时 wx.request 是可写属性——
 *    即使宿主基座的原生 wx 方法只读（真机 iOS），拷贝后也可补丁；
 * 2. index.js 里 uni 是 Proxy：get trap 惰性读 wx[name]，set trap 落 target
 *    自有属性，对 uni.request 赋值不会污染宿主 wx。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  __resetNetworkForTest,
  getNetworkRecords,
  installNetworkInterceptors,
} from '../src/runtime/network.ts'

function createHostWx() {
  return {
    canIUse: () => true,
    getSystemInfoSync: () => ({}),
    getLaunchOptionsSync: () => ({ scene: 1001 }),
    onAppRoute: vi.fn(),
    request(this: any, options: any) {
      // 模拟宿主 wx.request：异步回调
      setTimeout(() => {
        options.success &&
          options.success({ statusCode: 200, data: 'wx-host-data', header: {} })
        options.complete && options.complete({})
      }, 10)
      return { abort: vi.fn() }
    },
    uploadFile(this: any, options: any) {
      setTimeout(() => {
        options.success &&
          options.success({ statusCode: 200, data: '{"upload":"ok"}' })
      }, 10)
      return { abort: vi.fn() }
    },
    downloadFile(this: any, options: any) {
      setTimeout(() => {
        options.success &&
          options.success({ statusCode: 200, tempFilePath: '/tmp/f.file' })
      }, 10)
      return { abort: vi.fn() }
    },
  }
}

/** 模拟 vendor 求值期 initWx()：拷贝到新对象并整体替换 globalThis.wx */
function simulateVendorInitWx() {
  const oldWx = (globalThis as any).wx
  const newWx: any = {}
  for (const key in oldWx) newWx[key] = oldWx[key]
  newWx.getAppBaseInfo = newWx.getSystemInfoSync
  ;(globalThis as any).wx = newWx
}

/** 模拟 vendor 求值期 initUni：vue2 index.js 2712-2737 行的 Proxy 结构 */
function simulateVendorInitUni() {
  const target: any = {}
  ;(globalThis as any).uni = new Proxy(target, {
    get(t, name: string) {
      if (Object.prototype.hasOwnProperty.call(t, name)) return t[name]
      const wx = (globalThis as any).wx
      return wx ? wx[name] : undefined
    },
    set(t, name: string, value) {
      t[name] = value
      return true
    },
  })
}

describe('network: vue2 webpack 运行时环境模拟', () => {
  beforeEach(() => {
    vi.useRealTimers()
    __resetNetworkForTest()
  })

  afterEach(() => {
    __resetNetworkForTest()
    delete (globalThis as any).wx
    delete (globalThis as any).uni
    vi.restoreAllMocks()
  })

  it('场景A: vendor 先替换 wx 再建 uni Proxy，探针后注入，直调 wx.request 应被采集', async () => {
    // 1. 宿主基座提供 wx
    ;(globalThis as any).wx = createHostWx()
    // 2. vendor 求值：initWx 替换 + initUni 建 Proxy
    simulateVendorInitWx()
    simulateVendorInitUni()
    // 3. 探针注入（main.js microtask）
    installNetworkInterceptors({
      getUni: () => (globalThis as any).uni,
    })

    // 4. 业务代码直调 wx.request
    const got: any = await new Promise((resolve) => {
      ;(globalThis as any).wx.request({
        url: 'https://api.example.com/wx-direct',
        method: 'POST',
        data: { a: 1 },
        success: (res: any) => resolve(res),
      })
    })

    expect(got.data).toBe('wx-host-data')
    const { records } = getNetworkRecords()
    const hit = records.find(
      (r: any) => r.url === 'https://api.example.com/wx-direct',
    )
    expect(hit).toBeDefined()
    expect(hit.type).toBe('request')
    expect(hit.status).toBe(200)
  })

  it('场景B: uni.request 走 Proxy 惰性读 wx[name]，wx 补丁后 uni 调用也应被采集且无双记', async () => {
    ;(globalThis as any).wx = createHostWx()
    simulateVendorInitWx()
    simulateVendorInitUni()
    installNetworkInterceptors({
      getUni: () => (globalThis as any).uni,
    })

    await new Promise((resolve) => {
      ;(globalThis as any).uni.request({
        url: 'https://api.example.com/via-uni',
        success: () => resolve(null),
      })
    })

    const { records } = getNetworkRecords()
    const hits = records.filter(
      (r: any) => r.url === 'https://api.example.com/via-uni',
    )
    expect(hits.length).toBe(1)
  })

  it('场景C: 宿主 wx 属性只读（真实设备基座形态），替换后 newWx 可写，wx.request 仍应可补丁', async () => {
    // 真实设备：宿主 wx 的方法属性 writable:false / getter-only
    const hostWx: any = {}
    const hostRequest = function (options: any) {
      setTimeout(() => options.success({ statusCode: 200, data: 'ro-ok' }), 5)
    }
    Object.defineProperty(hostWx, 'request', {
      value: hostRequest,
      writable: false,
      configurable: false,
      enumerable: true,
    })
    ;(globalThis as any).wx = hostWx
    // vendor initWx 拷贝：for..in 枚举后赋到新对象 → newWx.request 可写
    simulateVendorInitWx()
    simulateVendorInitUni()
    installNetworkInterceptors({ getUni: () => (globalThis as any).uni })

    await new Promise((resolve) => {
      ;(globalThis as any).wx.request({
        url: 'https://api.example.com/readonly-host',
        success: () => resolve(null),
      })
    })

    const { records } = getNetworkRecords()
    expect(
      records.some(
        (r: any) => r.url === 'https://api.example.com/readonly-host',
      ),
    ).toBe(true)
  })

  it('已知边界: 业务方在 vendor 求值期提前捕获 wx.request 引用（早于探针注入），补丁无法覆盖已捕获引用', async () => {
    ;(globalThis as any).wx = createHostWx()
    simulateVendorInitWx()
    simulateVendorInitUni()

    // 业务模块（vendor 内第三方/自研 request 库）在探针前捕获了原始引用。
    // webpack 构建里 vendor.js 先于 main.js（探针注入点）求值，模块顶层的
    // const captured = wx.request 拿到的是原始函数——事后补丁 wx.request
    // 只能覆盖「通过全局对象发起」的调用，覆盖不了已捕获的局部引用。
    const capturedRequest = (globalThis as any).wx.request

    installNetworkInterceptors({ getUni: () => (globalThis as any).uni })

    await new Promise((resolve) => {
      capturedRequest({
        url: 'https://api.example.com/captured-ref',
        success: () => resolve(null),
      })
    })

    const { records } = getNetworkRecords()
    // 断言当前边界：该调用不被采集。若未来把探针注入提前到 vendor 之前，
    // 此断言需要同步翻转。
    expect(
      records.some(
        (r: any) => r.url === 'https://api.example.com/captured-ref',
      ),
    ).toBe(false)
  })

  it('场景E: wx.request 不带回调直接调（返回 RequestTask）也应有 pending 记录', async () => {
    ;(globalThis as any).wx = createHostWx()
    simulateVendorInitWx()
    simulateVendorInitUni()
    installNetworkInterceptors({ getUni: () => (globalThis as any).uni })

    ;(globalThis as any).wx.request({
      url: 'https://api.example.com/no-callback',
      method: 'GET',
    })
    await new Promise((r) => setTimeout(r, 30))

    const { records } = getNetworkRecords()
    expect(
      records.some((r: any) => r.url === 'https://api.example.com/no-callback'),
    ).toBe(true)
  })

  it('场景F: 老版运行时形态（无 wx.js 替换，宿主 wx 只读且不可配置）——安装不得抛错，uni 侧不受牵连', async () => {
    // 真实项目 @dcloudio/uni-mp-weixin@2.0.0-31220210205004 无 wx.js，
    // globalThis.wx 保持宿主基座原生对象；真机基座的方法属性可能只读。
    const hostWx: any = {}
    Object.defineProperty(hostWx, 'request', {
      value: function (options: any) {
        setTimeout(() => options.success({ statusCode: 200, data: 'ro' }), 5)
      },
      writable: false,
      configurable: false,
      enumerable: true,
    })
    ;(globalThis as any).wx = hostWx
    simulateVendorInitUni()

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // 若安装流程对只读属性直接赋值且未兜底，这里会抛 TypeError 导致 agent 整体初始化失败
    expect(() =>
      installNetworkInterceptors({ getUni: () => (globalThis as any).uni }),
    ).not.toThrow()
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Cannot intercept wx.request'),
    )

    // uni 侧拦截不受 wx 失败牵连，仍然工作
    await new Promise((resolve) => {
      ;(globalThis as any).uni.request({
        url: 'https://api.example.com/survives-wx-fail',
        success: () => resolve(null),
      })
    })
    expect(
      getNetworkRecords().records.some(
        (r: any) => r.url === 'https://api.example.com/survives-wx-fail',
      ),
    ).toBe(true)
  })

  it('场景G: 宿主 wx 只读但 configurable——defineProperty 降级生效，wx.request 仍被拦截', async () => {
    const hostWx: any = {}
    Object.defineProperty(hostWx, 'request', {
      value: function (options: any) {
        setTimeout(() => options.success({ statusCode: 200, data: 'dp-ok' }), 5)
      },
      writable: false,
      configurable: true,
      enumerable: true,
    })
    ;(globalThis as any).wx = hostWx
    simulateVendorInitUni()

    installNetworkInterceptors({ getUni: () => (globalThis as any).uni })

    await new Promise((resolve) => {
      ;(globalThis as any).wx.request({
        url: 'https://api.example.com/defineproperty-fallback',
        success: () => resolve(null),
      })
    })

    const { records } = getNetworkRecords()
    expect(
      records.some(
        (r: any) => r.url === 'https://api.example.com/defineproperty-fallback',
      ),
    ).toBe(true)
  })

  it('场景H: 重复 install 幂等——不误报「未找到网络方法」，不产生双记', async () => {
    ;(globalThis as any).wx = createHostWx()
    simulateVendorInitWx()
    simulateVendorInitUni()

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    installNetworkInterceptors({ getUni: () => (globalThis as any).uni })
    // HMR / 多页面重入场景：二次 install 走幂等路径
    installNetworkInterceptors({ getUni: () => (globalThis as any).uni })

    expect(warnSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('No network methods found'),
    )

    await new Promise((resolve) => {
      ;(globalThis as any).wx.request({
        url: 'https://api.example.com/idempotent',
        success: () => resolve(null),
      })
    })
    const hits = getNetworkRecords().records.filter(
      (r: any) => r.url === 'https://api.example.com/idempotent',
    )
    expect(hits.length).toBe(1)
  })
})
