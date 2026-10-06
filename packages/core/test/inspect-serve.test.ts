import { describe, expect, it } from 'vitest'
import { INSPECT_MOUNT_PATH, INSPECT_OUTPUT_DIR, createInspectApp, isInspectAvailable } from '../src/inspect-serve.ts'

describe('inspect-serve: vite inspect 静态托管（devframe mountStaticHandler 接线）', () => {
  it('挂载前缀与落盘目录约定符合冻结契约', () => {
    expect(INSPECT_MOUNT_PATH).toBe('/__uni-devtools/inspect')
    expect(INSPECT_OUTPUT_DIR).toContain('.uni-devtools')
    expect(INSPECT_OUTPUT_DIR.endsWith('.inspect')).toBe(true)
  })

  it('isInspectAvailable 返回布尔（真 tmpdir 状态由 sidecar 冒烟覆盖）', () => {
    expect(typeof isInspectAvailable()).toBe('boolean')
  })

  it('createInspectApp 构造完成挂载的 h3 app', () => {
    const app = createInspectApp()
    expect(typeof (app as unknown as { handler: unknown }).handler).toBe('function')
  })
})
