import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  INSPECT_MOUNT_PATH,
  INSPECT_OUTPUT_DIR,
  createInspectApp,
  isInspectAvailable,
} from '../src/inspect-serve.ts'

describe('inspect-serve: vite inspect 静态托管（devframe mountStaticHandler 接线）', () => {
  it('挂载前缀与落盘目录约定符合冻结契约', () => {
    expect(INSPECT_MOUNT_PATH).toBe('/__uni-devtools/inspect')
    expect(INSPECT_OUTPUT_DIR).toContain('.uni-devtools')
    expect(INSPECT_OUTPUT_DIR.endsWith('.inspect')).toBe(true)
  })

  it('isInspectAvailable 返回布尔（真 tmpdir 状态由 sidecar 冒烟覆盖）', () => {
    expect(typeof isInspectAvailable()).toBe('boolean')
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
