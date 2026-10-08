import { afterEach, describe, expect, it } from 'vitest'
import {
  BASE,
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
    expect(BASE).toBe('/__uni-devtools/')
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

  it('startUniDevtoolsServer 同步返回 devToken 并通过 ready / onStarted 暴露服务信息', async () => {
    let startedInfo: any = null
    const server = startUniDevtoolsServer({
      port: 0,
      onStarted: (info) => {
        startedInfo = info
      },
    })

    expect(typeof server.devToken).toBe('string')
    expect(server.devToken.length).toBeGreaterThan(0)
    expect(server.ready).toBeInstanceOf(Promise)

    const result = await server.ready
    expect(result).not.toBeNull()
    expect(result?.panelUrl).toContain(BASE)
    expect(result?.panelUrl).toContain(server.devToken)
    expect(result?.wsUrl).toContain(BASE)
    expect(result?.wsUrl).toContain('__ws')

    expect(startedInfo).not.toBeNull()
    expect(startedInfo.devToken).toBe(server.devToken)
    expect(startedInfo.wsUrl).toBe(result?.wsUrl)
    expect(startedInfo.panelUrl).toBe(result?.panelUrl)

    if (server.close) await server.close()
  })
})
