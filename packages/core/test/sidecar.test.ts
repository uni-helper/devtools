import { afterEach, describe, expect, it, vi } from 'vitest'
import { AGENT_CLIENT_MARKER, AgentRegistry } from '../src/relay.ts'
import {
  BASE,
  createDevServerOptions,
  isLocalMcpRequest,
  resolveAdvertisedHost,
  startUniDevtoolsServer,
} from '../src/sidecar.ts'

describe('sidecar: sidecar 启动收敛与参数解析', () => {
  const originalHost = process.env.UNI_DEVTOOLS_HOST
  const originalPort = process.env.UNI_DEVTOOLS_PORT

  afterEach(() => {
    if (originalHost !== undefined) process.env.UNI_DEVTOOLS_HOST = originalHost
    else delete process.env.UNI_DEVTOOLS_HOST

    if (originalPort !== undefined) process.env.UNI_DEVTOOLS_PORT = originalPort
    else delete process.env.UNI_DEVTOOLS_PORT
  })

  it('导出的 BASE 常量符合规范', () => {
    expect(BASE).toBe('/')
  })

  it('resolveAdvertisedHost 优先读取 UNI_DEVTOOLS_HOST 环境变量', () => {
    process.env.UNI_DEVTOOLS_HOST = '192.168.1.100'
    expect(resolveAdvertisedHost()).toBe('192.168.1.100')
  })

  it('resolveAdvertisedHost 无环境变量时回退到有效 host', () => {
    delete process.env.UNI_DEVTOOLS_HOST
    const host = resolveAdvertisedHost()
    expect(typeof host).toBe('string')
    expect(host.length).toBeGreaterThan(0)
  })

  it('默认不开启鉴权：面板地址不带 token', async () => {
    let startedInfo: any = null
    const server = startUniDevtoolsServer({
      port: 0,
      onStarted: (info) => {
        startedInfo = info
      },
    })

    expect(server.devToken).toBe('')
    expect(server.ready).toBeInstanceOf(Promise)

    const result = await server.ready
    expect(result).not.toBeNull()
    expect(result?.panelUrl).toMatch(new RegExp(`${BASE}$`))
    expect(result?.wsUrl).toContain(BASE)
    expect(result?.wsUrl).toContain('__ws')

    expect(startedInfo).not.toBeNull()
    expect(startedInfo.devToken).toBe('')
    expect(startedInfo.wsUrl).toBe(result?.wsUrl)
    expect(startedInfo.panelUrl).toBe(result?.panelUrl)

    if (server.close) await server.close()
  })

  it('auth: true 时同步返回 devToken，面板地址带上它', async () => {
    let startedInfo: any = null
    const server = startUniDevtoolsServer({
      port: 0,
      auth: true,
      onStarted: (info) => {
        startedInfo = info
      },
    })

    expect(server.devToken.length).toBeGreaterThan(0)

    const result = await server.ready
    expect(result?.panelUrl).toContain(
      `${BASE}?devframe_auth_token=${server.devToken}`,
    )
    expect(startedInfo.devToken).toBe(server.devToken)

    if (server.close) await server.close()
  })

  it('启动完成前调用 close：端口不残留监听，也不再宣告地址', async () => {
    const port = 31000 + Math.floor(Math.random() * 1000)
    let announced = false
    const server = startUniDevtoolsServer({
      port,
      onStarted: () => {
        announced = true
      },
    })

    await server.close?.()

    expect(await server.ready).toBeNull()
    expect(announced).toBe(false)
    await expect(fetch(`http://127.0.0.1:${port}${BASE}`)).rejects.toThrow()
  })
})

describe('sidecar: 鉴权开关', () => {
  const connectProbe = (token?: string) => {
    const registry = new AgentRegistry()
    const options = createDevServerOptions(registry, token)
    // devframe 在连接钩子之前写入 isTrusted：鉴权关闭时它不会被写成 true
    const meta = { isTrusted: false }
    const close = vi.fn()
    options.onPeerConnect!(
      { request: { url: `/__ws?${AGENT_CLIENT_MARKER}` }, close } as any,
      { meta, rpc: { $meta: meta, $call: vi.fn() } } as any,
    )
    return { options, registry, close }
  }

  it('未开启鉴权时关掉 devframe 鉴权，探针直接登记', () => {
    const { options, registry, close } = connectProbe()
    expect(options.auth).toBe(false)
    expect(registry.connected).toBe(true)
    expect(close).not.toHaveBeenCalled()
  })

  it('开启鉴权时没通过 token 校验的探针不登记', () => {
    const { options, registry, close } = connectProbe('panel-token')
    expect(typeof options.auth).toBe('function')
    expect(registry.connected).toBe(false)
    expect(close).toHaveBeenCalled()
  })
})

describe('sidecar: MCP 路由只对本机进程开放', () => {
  /** srvx 的 Request 上 `ip` 取自 socket 对端地址 */
  const requestFrom = (ip: string | undefined, origin?: string) =>
    Object.assign(
      new Request(`http://localhost:9999${BASE}__mcp`, {
        method: 'POST',
        headers: origin ? { origin } : {},
      }),
      { ip },
    )

  it('本机的 MCP 客户端（跑在 node 里、不发 Origin）放行', () => {
    expect(isLocalMcpRequest(requestFrom('127.0.0.1'))).toBe(true)
    expect(isLocalMcpRequest(requestFrom('::1'))).toBe(true)
    expect(isLocalMcpRequest(requestFrom('::ffff:127.0.0.1'))).toBe(true)
  })

  it('本机浏览器从本机源发起的请求放行', () => {
    expect(
      isLocalMcpRequest(requestFrom('127.0.0.1', 'http://localhost:9999')),
    ).toBe(true)
  })

  it('局域网里其他机器的请求被拒（sidecar 绑在 0.0.0.0）', () => {
    expect(isLocalMcpRequest(requestFrom('192.168.1.23'))).toBe(false)
  })

  it('外部网页借 DNS rebinding 打到本机的请求被拒', () => {
    expect(
      isLocalMcpRequest(requestFrom('127.0.0.1', 'http://evil.example')),
    ).toBe(false)
  })

  it('以 127. 开头的外部域名（可 rebinding 到本机）不算本机源', () => {
    expect(
      isLocalMcpRequest(requestFrom('127.0.0.1', 'http://127.evil.example')),
    ).toBe(false)
    expect(
      isLocalMcpRequest(
        requestFrom('127.0.0.1', 'http://127.0.0.1.evil.example:9999'),
      ),
    ).toBe(false)
  })

  it('拿不到对端地址时一律拒绝', () => {
    expect(isLocalMcpRequest(requestFrom(undefined))).toBe(false)
  })

  it('真实 sidecar 上，node 发起的 MCP initialize 能拿到应答，外部网页发起的被拒', async () => {
    let port = 0
    const server = startUniDevtoolsServer({
      port: 0,
      onStarted: (info) => {
        port = info.port
      },
    })
    await server.ready
    const initialize = (headers: Record<string, string> = {}) =>
      fetch(`http://127.0.0.1:${port}${BASE}__mcp`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
          ...headers,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2025-03-26',
            capabilities: {},
            clientInfo: { name: 'sidecar-test', version: '0' },
          },
        }),
      })
    try {
      const res = await initialize()
      expect(res.status).toBe(200)
      expect(await res.text()).toContain('"protocolVersion"')

      const fromWebPage = await initialize({ origin: 'http://evil.example' })
      expect(fromWebPage.ok).toBe(false)
    } finally {
      await server.close?.()
    }
  })
})
