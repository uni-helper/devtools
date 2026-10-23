import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  INSPECT_MOUNT_PATH,
  createInspectApp,
  isInspectAvailable,
  resolveInspectOutputDir,
} from '../src/inspect-serve.ts'

describe('inspect-serve: vite inspect 静态托管（devframe mountStaticHandler 接线）', () => {
  it('挂载前缀符合冻结契约', () => {
    expect(INSPECT_MOUNT_PATH).toBe('/__uni-devtools/inspect')
  })

  it('报告落在各自工程目录下：两个工程不会读到对方的报告', () => {
    const a = resolveInspectOutputDir('/work/app-a')
    const b = resolveInspectOutputDir('/work/app-b')
    expect(a).toBe(
      join('/work/app-a', 'node_modules', '.uni-devtools', 'inspect'),
    )
    expect(a).not.toBe(b)
  })

  it('报告目录里有 index.html 才算可用', () => {
    const dir = mkdtempSync(join(tmpdir(), 'uni-devtools-inspect-avail-'))
    expect(isInspectAvailable(dir)).toBe(false)
    writeFileSync(join(dir, 'index.html'), '')
    expect(isInspectAvailable(dir)).toBe(true)
  })
})

describe('inspect-serve: 报告含项目源码，只对持有面板 token 的人开放', () => {
  const TOKEN = 'panel-token-123'
  let dir: string
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'uni-devtools-inspect-test-'))
    writeFileSync(join(dir, 'index.html'), '<html>inspect</html>')
    mkdirSync(join(dir, 'reports'))
    writeFileSync(join(dir, 'reports', 'list.json'), '{"modules":[]}')
  })

  // sidecar 绑在 0.0.0.0，请求可能来自局域网里任何一台机器
  const request = (path: string, init?: RequestInit) =>
    createInspectApp({ token: TOKEN, dir }).fetch(
      new Request(`http://192.168.1.10:9999${path}`, init),
    )

  it('不带 token 读不到报告', async () => {
    const res = await request(`${INSPECT_MOUNT_PATH}/reports/list.json`)
    expect(res.status).toBe(403)
  })

  it('token 不对读不到报告', async () => {
    const res = await request(
      `${INSPECT_MOUNT_PATH}/?devframe_auth_token=wrong-token`,
    )
    expect(res.status).toBe(403)
  })

  it('面板带 token 打开 inspect 后，iframe 内的后续请求凭 cookie 放行', async () => {
    const entry = await request(
      `${INSPECT_MOUNT_PATH}/?devframe_auth_token=${TOKEN}`,
    )
    expect(entry.status).toBe(200)
    const cookie = entry.headers.get('set-cookie')?.split(';')[0]
    expect(cookie).toBeTruthy()

    const report = await request(`${INSPECT_MOUNT_PATH}/reports/list.json`, {
      headers: { cookie: cookie! },
    })
    expect(report.status).toBe(200)
    expect(await report.text()).toBe('{"modules":[]}')
  })

  it('inspect 之外的路径不受门禁影响', async () => {
    const res = await request('/__uni-devtools/')
    expect(res.status).not.toBe(403)
  })
})
