import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { warnIfStaleAgentDist } from '../src/stale-agent.ts'

/** 造一个「源码比预构建产物新」的探针包，返回产物路径 */
function createOutdatedProbesPackage(pkgDir: string): string {
  mkdirSync(join(pkgDir, 'dist'), { recursive: true })
  mkdirSync(join(pkgDir, 'src'), { recursive: true })
  const dist = join(pkgDir, 'dist', 'agent-vue2.js')
  writeFileSync(dist, '')
  writeFileSync(join(pkgDir, 'src', 'index.ts'), '')
  const earlier = new Date(Date.now() - 60_000)
  utimesSync(dist, earlier, earlier)
  return dist
}

describe('webpack: 探针预构建产物过期提醒', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('monorepo 里改了探针源码却没重新构建，提醒开发者', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const root = mkdtempSync(join(tmpdir(), 'uni-devtools-webpack-'))
    warnIfStaleAgentDist(
      createOutdatedProbesPackage(join(root, 'packages', 'probes')),
    )

    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('用户从 npm 装的探针包不提醒：解包后的时间戳不可信，用户也无从重新构建', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const root = mkdtempSync(join(tmpdir(), 'uni-devtools-webpack-'))
    warnIfStaleAgentDist(
      createOutdatedProbesPackage(
        join(root, 'node_modules', '@uni-helper', 'devtools-probes'),
      ),
    )

    expect(warn).not.toHaveBeenCalled()
  })
})
