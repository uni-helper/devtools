#!/usr/bin/env node
// 把 client 的面板构建产物拷进 core/dist/panel，随 core 一起发布：
// client 包是私有的、不发 npm，用户装到的面板只能来自这里
import { cpSync, existsSync, rmSync } from 'node:fs'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const src = fileURLToPath(new URL('../../client/dist', import.meta.url))
const dest = fileURLToPath(new URL('../dist/panel', import.meta.url))

if (!existsSync(`${src}/index.html`)) {
  console.error(
    `[devtools-core] 找不到面板构建产物 ${src}，先构建 @uni-helper/devtools-client`,
  )
  process.exit(1)
}

rmSync(dest, { recursive: true, force: true })
cpSync(src, dest, { recursive: true })
