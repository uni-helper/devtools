import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `dist/agent-vue2.js` 运行时冒烟——直接跑**构建产物**，而不是源码。
 *
 * 其余单测全部 import 源码，覆盖不到打包这一层：esbuild 的 external 处理、
 * 以及产物里 Vue 3 方法是否真的被剔干净，
 * 只有加载真实 bundle 才能验证。这正是 Vue 2 线的交付物（webpack 消费的是它）。
 *
 * `pnpm test` 会先跑 `build:agent-vue2` 产出文件；直接跑 vitest 且产物缺失时整组跳过（不伪装通过）。
 */
const BUNDLE_PATH = fileURLToPath(
  new URL('../dist/agent-vue2.js', import.meta.url),
)
const bundleExists = existsSync(BUNDLE_PATH)

/**
 * 产物是 CJS（webpack 4 用 require 消费），而本包 `"type": "module"` 会让 Node 把
 * `.js` 当 ESM 加载——所以按 CommonJS 包装函数手动求值。只求值一次：产物内的
 * 探针单例跨用例共享，与真实运行时一致（用例间靠 disposeAgent 复位）。
 */
let bundle: any
function loadBundle(): any {
  if (!bundle) {
    const module = { exports: {} as any }
    const code = readFileSync(BUNDLE_PATH, 'utf8')
    // eslint-disable-next-line no-new-func
    new Function('module', 'exports', 'require', code)(
      module,
      module.exports,
      createRequire(BUNDLE_PATH),
    )
    bundle = module.exports
  }
  return bundle
}

/** 造一个最小的小程序 socket 宿主：记录 send 出去的数据，暴露 onXxx 回调供测试驱动 */
function createUniHost() {
  const sent: string[] = []
  const handlers: Record<string, ((res: any) => void) | undefined> = {}

  const socketTask = {
    onOpen: (fn: (res: any) => void) => {
      handlers.open = fn
    },
    onMessage: (fn: (res: any) => void) => {
      handlers.message = fn
    },
    onError: (fn: (res: any) => void) => {
      handlers.error = fn
    },
    onClose: (fn: (res: any) => void) => {
      handlers.close = fn
    },
    send: (opts: { data: string }) => {
      sent.push(opts.data)
    },
    close: () => {},
  }

  const connectSocket = vi.fn(() => socketTask)
  return {
    uni: { connectSocket },
    connectSocket,
    sent,
    handlers,
    /** 驱动一条「服务端 → 探针」的帧 */
    emit: (payload: unknown) =>
      handlers.message?.({ data: JSON.stringify(payload) }),
    /** 解析探针发出的所有帧 */
    frames: () => sent.map((raw) => JSON.parse(raw)),
  }
}

/** birpc 的响应在微任务里投递，让出几轮事件循环再断言 */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe.skipIf(!bundleExists)(
  'dist/agent-vue2.js 运行时冒烟（Vue 2 冻结产物）',
  () => {
    let host: ReturnType<typeof createUniHost>

    beforeEach(() => {
      host = createUniHost()
      ;(globalThis as any).uni = host.uni
      ;(globalThis as any).getCurrentPages = () => [
        { route: 'pages/index', options: { from: 'test' } },
      ]
      vi.spyOn(console, 'log').mockImplementation(() => {})
      vi.spyOn(console, 'warn').mockImplementation(() => {})
    })

    afterEach(async () => {
      const mod = loadBundle()
      mod.disposeAgent()
      delete (globalThis as any).uni
      delete (globalThis as any).getCurrentPages
      vi.restoreAllMocks()
    })

    it('导出冻结契约的 3 个 API', async () => {
      const mod = loadBundle()

      expect(typeof mod.initAgent).toBe('function')
      expect(typeof mod.getAgentInstance).toBe('function')
      expect(typeof mod.disposeAgent).toBe('function')
    })

    it('initAgent 用带 token 与 client=uni-agent 标记的 URL 建连，disposeAgent 后单例清空', async () => {
      const mod = loadBundle()

      const instance = mod.initAgent({
        wsUrl: 'ws://127.0.0.1:9999/__ws',
        token: 'tok-123',
      })

      expect(host.connectSocket).toHaveBeenCalledTimes(1)
      const url = host.connectSocket.mock.calls[0][0].url
      expect(url).toContain('devframe_auth_token=tok-123')
      expect(url).toContain('client=uni-agent')
      expect(mod.getAgentInstance()).toBe(instance)

      mod.disposeAgent()
      expect(mod.getAgentInstance()).toBeNull()
    })

    it('wire 层：ping 可应答，Vue 3 专属方法不存在', async () => {
      const mod = loadBundle()
      mod.initAgent({
        wsUrl: 'ws://127.0.0.1:9999/__ws',
        token: 'tok-123',
      })
      host.handlers.open?.({}) // 触发 open，flush 待发队列

      host.emit({ t: 'q', i: 1, m: 'uni-devtools:agent:ping', a: [] })
      await flush()

      const pingRes = host
        .frames()
        .find((frame) => frame.t === 's' && frame.i === 1)
      expect(pingRes).toBeDefined()
      expect(typeof pingRes.r).toBe('number')
      expect(pingRes.e).toBeUndefined()

      host.emit({ t: 'q', i: 2, m: 'uni-devtools:agent:getPiniaStores', a: [] })
      await flush()

      // 方法不存在时 birpc 回 { t:'s', i, e } 而非执行结果；Error 经 JSON 序列化后
      // message 会丢失，故只断言「有 error 无 result」这一语义。
      const piniaRes = host
        .frames()
        .find((frame) => frame.t === 's' && frame.i === 2)
      expect(piniaRes).toBeDefined()
      expect('e' in piniaRes).toBe(true)
      expect(piniaRes.r).toBeUndefined()

      mod.disposeAgent()
    })

    it('wire 层：getComponentTree 返回 { pages, vueVersion } 结构', async () => {
      const mod = loadBundle()
      mod.initAgent({
        wsUrl: 'ws://127.0.0.1:9999/__ws',
        token: 'tok-123',
      })
      host.handlers.open?.({})

      host.emit({
        t: 'q',
        i: 3,
        m: 'uni-devtools:agent:getComponentTree',
        a: [],
      })
      await flush()

      const res = host
        .frames()
        .find((frame) => frame.t === 's' && frame.i === 3)
      expect(res).toBeDefined()
      expect(Array.isArray(res.r.pages)).toBe(true)

      mod.disposeAgent()
    })
  },
)
