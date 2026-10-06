import process from 'node:process'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getProjectRoot, isInsideProjectRoot } from '../src/devframe.ts'

describe('getProjectRoot & isInsideProjectRoot', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('优先使用 UNI_CLI_CONTEXT 作为项目根', () => {
    process.env.UNI_CLI_CONTEXT = '/custom/project/root'
    expect(getProjectRoot()).toBe('/custom/project/root')
  })

  it('在 UNI_INPUT_DIR 以 /src 结尾时项目根为其父目录', () => {
    delete process.env.UNI_CLI_CONTEXT
    process.env.UNI_INPUT_DIR = '/custom/project/src'
    expect(getProjectRoot()).toBe('/custom/project')
  })

  it('无 UNI_INPUT_DIR 时退回到 process.cwd()', () => {
    delete process.env.UNI_CLI_CONTEXT
    delete process.env.UNI_INPUT_DIR
    expect(getProjectRoot()).toBe(process.cwd())
  })

  it('isInsideProjectRoot 允许项目根内文件', () => {
    const root = '/my/project'
    expect(isInsideProjectRoot('/my/project/src/components/A.vue', root)).toBe(true)
    expect(isInsideProjectRoot('/my/project/package.json', root)).toBe(true)
  })

  it('isInsideProjectRoot 拒绝越界路径', () => {
    const root = '/my/project'
    expect(isInsideProjectRoot('/etc/passwd', root)).toBe(false)
    expect(isInsideProjectRoot('/my/other-project/file.vue', root)).toBe(false)
    expect(isInsideProjectRoot(resolve(root, '../../etc/passwd'), root)).toBe(false)
  })
})
