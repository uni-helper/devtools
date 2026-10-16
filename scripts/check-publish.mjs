#!/usr/bin/env node
// 发布前自检（需先 pnpm build）：按 npm 实际会打进 tarball 的文件清单，核对每个
// 待发布包的入口都在、面板随 core 发布、没有夹带杂物，且 dist 入口能被 node 加载。
// monorepo 里的软链与 shamefully-hoist 会掩盖这些问题，只有装成 npm 包才暴露
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

const root = resolve(import.meta.dirname, '..')
const problems = []

function packedFiles(dir) {
  const out = execFileSync(
    'npm',
    ['pack', '--dry-run', '--json', '--ignore-scripts'],
    { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
  )
  return new Set(JSON.parse(out)[0].files.map((f) => f.path))
}

/** exports / main / types / bin 里出现的所有文件路径 */
function entryPaths(pkg) {
  const paths = []
  const walk = (value) => {
    if (typeof value === 'string') paths.push(value)
    else if (value && typeof value === 'object')
      Object.values(value).forEach(walk)
  }
  walk(pkg.exports)
  walk(pkg.main)
  walk(pkg.types)
  walk(pkg.bin)
  return paths.map((p) => p.replace(/^\.\//, ''))
}

for (const name of readdirSync(join(root, 'packages'))) {
  const dir = join(root, 'packages', name)
  const source = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  if (source.private) continue
  // pnpm 打包时用 publishConfig 覆盖同名字段，用户拿到的是覆盖后的版本
  const pkg = { ...source, ...source.publishConfig }
  const report = (msg) => problems.push(`${pkg.name}: ${msg}`)

  const files = packedFiles(dir)
  for (const entry of entryPaths(pkg))
    if (!files.has(entry)) report(`入口 ${entry} 不在打包文件里`)
  for (const file of files)
    if (/^(?:\.turbo|test|scripts)\/|vitest\.config|tsconfig/.test(file))
      report(`夹带了无关文件 ${file}`)
  if (name === 'core' && !files.has('dist/panel/index.html'))
    report('面板 dist/panel 没有随包发布')

  // 只加载 node 侧入口：.js 是探针的小程序产物，cli 一加载就开始解析命令行
  for (const entry of entryPaths(pkg).filter(
    (p) => p.endsWith('.mjs') && !p.endsWith('cli.mjs'),
  )) {
    try {
      await import(pathToFileURL(join(dir, entry)).href)
    } catch (err) {
      report(`${entry} 加载失败：${err.message}`)
    }
  }
}

if (problems.length) {
  console.error(
    `发布自检未通过：\n${problems.map((p) => `  - ${p}`).join('\n')}`,
  )
  process.exit(1)
}
console.log('发布自检通过')
// 被加载的插件 dist 可能留下句柄（如 sidecar 相关模块），显式退出
process.exit(0)
