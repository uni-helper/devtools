#!/usr/bin/env node
// 为当前包产出 dist 下的 .d.ts（JS 默认仍由各包的 esbuild 构建）。
// 用法：node build-dts.mjs [--js] [出口名=源文件 ...]，缺省为 index=src/index.ts。
// 发布出去的类型只能指向这里产出的声明文件：.ts 源码带 .ts 后缀导入，用户的 tsc
// 读到就报错。开发时 exports 仍指向源码，发布时由 publishConfig.exports 换成 dist
//
// --js：同时产出 dist/<出口名>.mjs（依赖一律 external，多入口共享 chunk）。给没有
// 自建 esbuild 流程、但发布后要被 node 直接加载的包用——node 不对 node_modules
// 里的 .ts 做类型剥离，publishConfig 指向源码就加载失败。
import { readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { build } from 'tsup'

const args = process.argv.slice(2)
const withJs = args.includes('--js')
const entryArgs = args.filter((arg) => arg !== '--js')
const entry = Object.fromEntries(
  (entryArgs.length ? entryArgs : ['index=src/index.ts']).map((arg) =>
    arg.split('='),
  ),
)

// chunk 名带 hash，不清就越积越多、被一起发布。不能用 tsup 的 clean：它会连同
// dist 里别的产物（core 拷进来的面板 dist/panel）一起删掉
function removeStaleJs(dir) {
  let names
  try {
    names = readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const item of names) {
    const path = join(dir, item.name)
    if (item.isDirectory()) {
      if (item.name !== 'panel') removeStaleJs(path)
    } else if (item.name.endsWith('.mjs')) rmSync(path)
  }
}
if (withJs) removeStaleJs('dist')

await build({
  entry,
  format: ['esm'],
  outDir: 'dist',
  dts: withJs ? true : { only: true },
  ...(withJs
    ? {
        splitting: true,
        target: 'node18',
        platform: 'node',
        outExtension: () => ({ js: '.mjs' }),
      }
    : {}),
  clean: false,
  silent: true,
  tsconfig: `${process.cwd()}/tsconfig.json`,
})
