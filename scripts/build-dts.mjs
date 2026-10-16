#!/usr/bin/env node
// 为当前包产出 dist 下的 .d.ts（JS 仍由各包的 esbuild 构建）。
// 用法：node build-dts.mjs [出口名=源文件 ...]，缺省为 index=src/index.ts。
// 发布出去的类型只能指向这里产出的声明文件：.ts 源码带 .ts 后缀导入，用户的 tsc
// 读到就报错。开发时 exports 仍指向源码，发布时由 publishConfig.exports 换成 dist
import process from 'node:process'
import { build } from 'tsup'

const args = process.argv.slice(2)
const entry = Object.fromEntries(
  (args.length ? args : ['index=src/index.ts']).map((arg) => arg.split('=')),
)

await build({
  entry,
  format: ['esm'],
  outDir: 'dist',
  dts: { only: true },
  clean: false,
  silent: true,
  tsconfig: `${process.cwd()}/tsconfig.json`,
})
