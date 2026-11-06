import { spawn, type ChildProcess } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { expect, sleep, test, verifyTree } from './fixtures'

// playground 是 CJS 工程，没有 import.meta
const CLI = path.resolve(__dirname, '../../../packages/devtools/dist/cli.mjs')

/** 按 MCP 客户端的方式起 `uni-devtools connect`：stdio 上逐行收发 JSON-RPC */
function startConnect() {
  const child: ChildProcess = spawn(process.execPath, [CLI, 'connect'], {
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  const pending = new Map<number, (msg: any) => void>()
  let nextId = 0
  let buffer = ''
  child.stdout!.on('data', (chunk: Buffer) => {
    buffer += chunk.toString()
    let index: number
    while ((index = buffer.indexOf('\n')) >= 0) {
      const msg = JSON.parse(buffer.slice(0, index))
      buffer = buffer.slice(index + 1)
      pending.get(msg.id)?.(msg)
      pending.delete(msg.id)
    }
  })
  const send = (message: object) =>
    child.stdin!.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`)
  const request = (method: string, params: object) =>
    new Promise<any>((resolve) => {
      const id = nextId++
      pending.set(id, resolve)
      send({ id, method, params })
    })
  /** 调网关工具，返回工具结果里那段 JSON 文本解析后的对象 */
  const callTool = async (name: string, args: object) => {
    const msg = await request('tools/call', { name, arguments: args })
    expect(msg.error, `${name} 返回 JSON-RPC 错误`).toBeUndefined()
    return JSON.parse(msg.result.content[0].text)
  }
  const ready = request('initialize', {
    protocolVersion: '2025-03-26',
    capabilities: {},
    clientInfo: { name: 'uni-devtools-e2e', version: '0' },
  }).then(() => send({ method: 'notifications/initialized' }))
  return { ready, callTool, close: () => child.kill() }
}

test('connect 网关：从实例注册表找到 sidecar，拿到小程序实时数据', async ({
  miniProgram,
  page,
  rpc,
}) => {
  await miniProgram.open('pages/index')
  // 先经面板同款连接确认探针已推送组件树，再走 connect 比对
  const { flat } = await verifyTree(page, rpc, 'index')

  const connect = startConnect()
  try {
    await connect.ready
    const port = Number(new URL(process.env.UNI_E2E_BASE_URL!).port)

    const { instances } = await connect.callTool(
      'devframe_connect_list-instances',
      {},
    )
    const instance = instances.find((i: any) => i.port === port)
    expect(instance, `注册表里应有端口 ${port} 的实例`).toBeTruthy()
    expect(instance.id).toBe('uni-helper-devtools')

    const call = async (tool: string, args: object = {}) => {
      const result = await connect.callTool('devframe_connect_call-tool', {
        port,
        tool: `uni-helper-devtools_${tool}`,
        args,
      })
      expect(result.isError, JSON.stringify(result.content)).toBe(false)
      return JSON.parse(result.content[0].text)
    }

    const router = await call('get-router-info')
    expect(JSON.stringify(router)).toContain('pages/index')

    // 探针推送有防抖：与面板连接看到的节点数一致即说明是同一份实时数据
    let tree: any
    for (let i = 0; i < 10; i++) {
      tree = await call('get-component-tree')
      if (tree?.pages?.[0]?.route === 'pages/index') break
      await sleep(500)
    }
    expect(tree.pages.map((p: any) => p.route)).toEqual(['pages/index'])
    expect(JSON.stringify(tree)).toContain(flat[0]!.id)
  } finally {
    connect.close()
  }
})
