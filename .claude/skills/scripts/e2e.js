#!/usr/bin/env node
/* eslint-disable no-console, node/prefer-global/process, no-undef, style/max-statements-per-line, no-new-func */
/**
 * mp-weixin E2E：驱动微信开发者工具模拟器，端到端验证探针组件树
 *
 * 用法（可在任意目录执行，仓库根由脚本自动向上探测）：
 *   node .claude/skills/scripts/e2e.js --build              # 脚本自己起 pnpm dev:mp-weixin，从日志解析 token
 *   node .claude/skills/scripts/e2e.js --base-url <url> --token <token>  # 构建已在跑时手动指定 sidecar
 *   node .claude/skills/scripts/e2e.js --fresh              # 先结束微信开发者工具再拉起（端口未开/实例卡死时用）
 *   node .claude/skills/scripts/e2e.js --scenarios baseline,tab-switch   # 只跑指定场景
 *
 * 依赖：miniprogram-automator（workspace devDependency）、微信开发者工具
 * 平台：macOS 开箱可用；Windows 需 --wx-cli 指定 cli.bat；Linux 无官方 CLI
 *
 * 每个场景的通过标准（与探针行为对齐）：
 *   1. 中继快照（get-component-tree）无重复节点 id
 *   2. 中继快照节点数 === 模拟器内核按探针同款规则遍历的存活节点数
 *      （两者不一致 = 探针序列化与内核遍历出现偏差，正是死实例泄漏这类 bug 的信号）
 *   3. 回到「全部组件」Tab 后组件总数恢复基线值、TestComp 恒为 1
 *   内核 $children 链上的死实例只作信息输出——uni-mp 内核卸载从不清链，
 *   死实例滞留是内核行为，探针负责过滤，所以不算失败。
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile, spawn } from 'node:child_process'
import { createRequire } from 'node:module'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))

/**
 * 向上探测仓库根：脚本位于 .claude/skills/scripts/ 这类深层目录，用 '..' 硬推
 * 会解析到 .claude/skills（playground 路径全错）——必须以仓库标记文件为准。
 * 标记：pnpm-workspace.yaml（monorepo）或含 workspaces 字段的 package.json。
 */
function findRepoRoot(startDir) {
  let dir = startDir
  while (true) {
    for (const marker of ['pnpm-workspace.yaml', 'pnpm-workspace.yml']) {
      if (fs.existsSync(path.join(dir, marker))) return dir
    }
    const pkg = path.join(dir, 'package.json')
    if (fs.existsSync(pkg)) {
      try {
        if (JSON.parse(fs.readFileSync(pkg, 'utf8')).workspaces) return dir
      } catch {
        /* 坏 package.json，继续往上 */
      }
    }
    const parent = path.dirname(dir)
    if (parent === dir) return null // 到文件系统根仍未找到
    dir = parent
  }
}

const ROOT = findRepoRoot(SCRIPT_DIR) || process.cwd()
const PLAYGROUND_REL = 'playground/vue3-vite'
const AUTOMATOR_PORT = 9420
const NAMESPACE = 'uni-helper-devtools'

/** 微信开发者工具 CLI 候选路径（按平台），可用 --wx-cli 或 WX_DEVTOOLS_CLI 覆盖 */
const WX_CLI_CANDIDATES = {
  darwin: [
    '/Applications/wechatwebdevtools.app/Contents/MacOS/cli',
    path.join(
      process.env.HOME || '',
      'Applications/wechatwebdevtools.app/Contents/MacOS/cli',
    ),
  ],
  win32: [
    'C:\\Program Files (x86)\\Tencent\\微信web开发者工具\\cli.bat',
    'C:\\Program Files\\Tencent\\微信web开发者工具\\cli.bat',
  ],
  linux: [], // 官方未提供 Linux CLI
}

function resolveWxCli(explicit) {
  if (explicit) return explicit
  if (process.env.WX_DEVTOOLS_CLI) return process.env.WX_DEVTOOLS_CLI
  const candidates = WX_CLI_CANDIDATES[process.platform] || []
  return candidates.find((p) => p && fs.existsSync(p)) || candidates[0]
}

// ---------- 参数 ----------

function parseArgs(argv) {
  const args = {
    build: false,
    fresh: false,
    keepBuild: false,
    keepIde: true,
    baseUrl: undefined,
    token: undefined,
    project: undefined, // 缺省时按 --playground 推导
    playground: PLAYGROUND_REL,
    devScript: 'dev:mp-weixin',
    wxCli: undefined, // 缺省时按平台探测 / WX_DEVTOOLS_CLI
    scenarios: 'baseline,tab-switch,rapid-switch,navigation,keepalive,chaos',
    chaosMs: 30000,
    seed: 20261008,
  }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--build') {
      args.build = true
    } else if (a === '--fresh') {
      args.fresh = true
    } else if (a === '--keep-build') {
      args.keepBuild = true
    } else if (a === '--kill-ide') {
      args.keepIde = false
    } else if (a === '--base-url') {
      args.baseUrl = argv[++i]
    } else if (a === '--token') {
      args.token = argv[++i]
    } else if (a === '--project') {
      args.project = path.resolve(argv[++i])
    } else if (a === '--playground') {
      args.playground = argv[++i]
    } else if (a === '--dev-script') {
      args.devScript = argv[++i]
    } else if (a === '--wx-cli') {
      args.wxCli = path.resolve(argv[++i])
    } else if (a === '--scenarios') {
      args.scenarios = argv[++i]
    } else if (a === '--chaos-ms') {
      args.chaosMs = Number(argv[++i])
    } else if (a === '--seed') {
      args.seed = Number(argv[++i])
    } else if (a === '--help' || a === '-h') {
      args.help = true
    } else {
      console.error(`未知参数: ${a}`)
      args.help = true
    }
  }
  // 派生：playground 目录与构建产物目录
  args.playgroundDir = path.resolve(ROOT, args.playground)
  if (!args.project)
    args.project = path.join(args.playgroundDir, 'dist/dev/mp-weixin')
  args.wxCli = resolveWxCli(args.wxCli)
  return args
}

function printHelp() {
  console.log(`mp-weixin E2E 组件树验证

选项：
  --build              由脚本启动 pnpm dev:mp-weixin 并从日志解析面板地址/token
  --base-url <url>     sidecar 已在跑时手动指定，如 http://localhost:51939/__uni-devtools/
  --token <token>      与 --base-url 搭配；来自构建日志的 devframe_auth_token
  --project <path>     小程序构建产物目录（默认 <playground>/dist/dev/mp-weixin）
  --playground <path>  构建所在的 playground 目录（默认 playground/vue3-vite，相对仓库根）
  --dev-script <name>  启动构建用的 package script（默认 dev:mp-weixin）
  --wx-cli <path>      微信开发者工具 CLI 路径（默认按平台探测，可用 WX_DEVTOOLS_CLI 覆盖）
  --scenarios <list>   逗号分隔，可选 baseline,tab-switch,rapid-switch,navigation,keepalive,chaos
  --chaos-ms <n>       chaos 场景持续毫秒数（默认 30000）
  --seed <n>           chaos 伪随机种子（默认固定值，保证可复现）
  --fresh              先结束微信开发者工具再拉起
  --keep-build         场景结束后保留脚本启动的构建 watcher
  --kill-ide           场景结束后关闭微信开发者工具
  -h, --help           显示本帮助

仓库根自动向上探测（pnpm-workspace.yaml 或含 workspaces 的 package.json），
故脚本可在任意目录执行。`)
}

// ---------- 小工具 ----------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function exec(cmd, args) {
  return new Promise((resolve) => {
    execFile(cmd, args, (err, stdout) => resolve({ err, stdout: stdout || '' }))
  })
}

async function portListening(port) {
  // 纯 node 端口探测（原先用 lsof，Windows 上没有该命令）
  const net = await import('node:net')
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port })
    const done = (result) => {
      socket.destroy()
      resolve(result)
    }
    socket.setTimeout(1000)
    socket.on('connect', () => done(true))
    socket.on('timeout', () => done(false))
    socket.on('error', () => done(false))
  })
}

/** 结束所有微信开发者工具进程（跨平台；--fresh 与重试路径共用） */
async function killIde() {
  if (process.platform === 'win32') {
    await exec('taskkill', ['/F', '/IM', 'wechatdevtools.exe'])
    await exec('taskkill', ['/F', '/IM', '微信开发者工具.exe'])
  } else {
    await exec('pkill', ['-f', 'wechatdevtools'])
  }
}

/** mulberry32：可复现的伪随机（chaos 场景用，种子打印在日志里） */
function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

async function dumpArtifacts(label, payload) {
  // 产物落在脚本旁边（.claude/skills/scripts/e2e-artifacts/），与仓库布局无关
  const dir = path.join(SCRIPT_DIR, 'e2e-artifacts')
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(
    dir,
    `${new Date().toISOString().replace(/[:.]/g, '-')}-${label}.json`,
  )
  fs.writeFileSync(file, JSON.stringify(payload, null, 2))
  console.error(`  📦 现场快照已保存: ${path.relative(ROOT, file)}`)
}

// ---------- 依赖检查 ----------

function resolveDep(name) {
  for (const base of [import.meta.url, path.join(ROOT, 'package.json')]) {
    try {
      return createRequire(base).resolve(name)
    } catch {
      /* 下一个候选 */
    }
  }
  return undefined
}

async function requireDeps(args) {
  if (!resolveDep('miniprogram-automator/package.json')) {
    console.error(
      '缺少依赖 miniprogram-automator。在仓库根目录执行：\n  pnpm add -w -D miniprogram-automator',
    )
    process.exit(2)
  }
  if (!resolveDep('devframe/client')) {
    console.error(
      '缺少依赖 devframe（中继连接用）。请确认从本仓库内执行本脚本。',
    )
    process.exit(2)
  }
  if (!fs.existsSync(args.playgroundDir)) {
    console.error(
      `playground 目录不存在: ${args.playgroundDir}\n用 --playground <path> 指定（相对仓库根 ${ROOT}）。`,
    )
    process.exit(2)
  }
  if (!args.wxCli) {
    console.error(
      `未找到微信开发者工具 CLI（平台 ${process.platform}）。\n` +
        '用 --wx-cli <path> 或环境变量 WX_DEVTOOLS_CLI 指定，例如：\n' +
        '  macOS : /Applications/wechatwebdevtools.app/Contents/MacOS/cli\n' +
        '  Windows: C:\\Program Files (x86)\\Tencent\\微信web开发者工具\\cli.bat',
    )
    process.exit(2)
  }
  if (!fs.existsSync(args.wxCli)) {
    console.error(
      `微信开发者工具 CLI 路径不存在: ${args.wxCli}\n用 --wx-cli 指定正确路径。`,
    )
    process.exit(2)
  }
}

// ---------- 构建 watcher 与 sidecar ----------

async function startBuildWatcher(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('pnpm', [args.devScript], {
      cwd: args.playgroundDir,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let buffer = ''
    let resolved = false
    const cleanup = () => {
      try {
        process.kill(-child.pid, 'SIGTERM')
      } catch {
        child.kill('SIGTERM')
      }
    }
    const onChunk = (chunk) => {
      const text = chunk.toString()
      buffer += text
      for (const line of text.split('\n')) {
        if (line.trim()) console.error(`  [build] ${line}`)
      }
      // 面板 URL 行 = sidecar 已起；Build complete = bundle 可加载
      const tokenMatch = /devframe_auth_token=([0-9a-fA-F]+)/.exec(buffer)
      if (tokenMatch && /Build complete/.test(buffer) && !resolved) {
        const portMatch = /:(\d+)\/__uni-devtools\//.exec(buffer)
        if (!portMatch) return
        resolved = true
        resolve({
          child,
          cleanup,
          baseURL: `http://localhost:${portMatch[1]}/__uni-devtools/`,
          token: tokenMatch[1],
        })
      }
    }
    child.stdout.on('data', onChunk)
    child.stderr.on('data', onChunk)
    child.on('exit', (code) => {
      if (!resolved) reject(new Error(`构建进程提前退出（code=${code}）`))
    })
    setTimeout(() => {
      if (!resolved) {
        cleanup()
        reject(
          new Error(
            `等待构建/sidecar 就绪超时（180s）——检查 pnpm ${args.devScript} 是否能正常启动`,
          ),
        )
      }
    }, 180000).unref()
  })
}

// ---------- 微信开发者工具 ----------
// （启动与连接的编排见 ensureIdeAndAutomator）

// ---------- 连接 ----------

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} 超时（${ms}ms）`)), ms),
    ),
  ])
}

/**
 * 确保 IDE 可用且模拟器响应，返回 { miniProgram, ideChild }。
 *
 * 端口在监听 ≠ 模拟器可用：IDE 空转久了 appService 会僵死（connect 成功但
 * currentPage 无响应）。所以每轮都以「能否真正驱动页面」为准；第一轮失败
 * 且 IDE 不是本进程拉起的，pkill 后重启再试一轮。
 */
async function ensureIdeAndAutomator(args) {
  const { default: automator } = await import('miniprogram-automator')
  for (let attempt = 1; attempt <= 2; attempt++) {
    let ideChild
    if (!(await portListening(AUTOMATOR_PORT))) {
      if (args.fresh) {
        console.error('… 结束微信开发者工具进程（--fresh）')
        await killIde()
        await sleep(3000)
      }
      ideChild = await launchIde(args)
    }
    // 端口就绪 ≠ 模拟器就绪：首次编译完成前 connect/currentPage 都会报错或无响应，
    // 以「能真正驱动页面」为准持续轮询
    const start = Date.now()
    let lastErr
    while (Date.now() - start < 90000) {
      try {
        const miniProgram = await withTimeout(
          automator.connect({ wsEndpoint: `ws://localhost:${AUTOMATOR_PORT}` }),
          15000,
          'automator 连接',
        )
        const page = await withTimeout(
          miniProgram.currentPage(),
          10000,
          'currentPage',
        )
        console.error(`✓ 模拟器已连接，当前页面: ${page && page.path}`)
        return { miniProgram, ideChild }
      } catch (err) {
        lastErr = err
        await sleep(6000)
      }
    }
    console.error(
      `… 模拟器始终无响应（第 ${attempt} 次）: ${lastErr && lastErr.message}`,
    )
    ideChild?.kill('SIGTERM')
    if (attempt === 1) {
      console.error('… 重启微信开发者工具后重试')
      await killIde()
      await sleep(4000)
    }
  }
  throw new Error(
    '模拟器始终无响应。人工排查：IDE 是否登录、设置 → 安全设置 → 服务端口是否开启、项目是否已打开',
  )
}

async function launchIde(args) {
  console.error(
    '… 启动微信开发者工具（首次拉起较慢，服务端口未开时自动回 y 确认）',
  )
  // Windows 的 cli.bat 无法被 spawn 直接执行，需经 shell
  const isWindowsBatch = /\.(bat|cmd)$/i.test(args.wxCli)
  const child = spawn(
    args.wxCli,
    ['auto', '--project', args.project, '--auto-port', String(AUTOMATOR_PORT)],
    {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: isWindowsBatch,
    },
  )
  // CLI 在服务端口关闭时会交互式询问 "Enable IDE Service (y/N)"
  child.stdin.write('y\n')
  child.stdout.on('data', (c) => process.stderr.write(`  [cli] ${c}`))
  child.stderr.on('data', (c) => process.stderr.write(`  [cli] ${c}`))

  const start = Date.now()
  while (Date.now() - start < 120000) {
    if (await portListening(AUTOMATOR_PORT)) {
      console.error(`✓ IDE 自动化端口 :${AUTOMATOR_PORT} 已就绪`)
      return child
    }
    await sleep(2000)
  }
  child.kill('SIGTERM')
  throw new Error(
    '等待 IDE 自动化端口超时（120s）。检查：IDE 是否已登录；设置 → 安全设置 → 服务端口是否开启',
  )
}

async function connectRelay(baseURL, token) {
  // devframe client 面向浏览器环境，node 下补最小全局（resolveWsUrl 读取 location）
  if (typeof globalThis.location === 'undefined')
    globalThis.location = new URL(baseURL)
  if (typeof globalThis.window === 'undefined') globalThis.window = globalThis
  const { connectDevframe } = await import('devframe/client')
  const client = await connectDevframe({
    baseURL,
    authToken: token,
    simpleAuth: false,
    otpParam: false,
  })
  await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () =>
        reject(
          new Error(
            `中继连接超时（${baseURL}）——确认 sidecar 在跑、token 正确`,
          ),
        ),
      15000,
    )
    client.events.on('connection:status', (status) => {
      if (status === 'connected') {
        clearTimeout(timer)
        resolve()
      } else if (status === 'unauthorized' || status === 'error') {
        clearTimeout(timer)
        reject(
          new Error(
            `中继鉴权失败（${status}）——token 是否来自当前那次构建的日志？`,
          ),
        )
      }
    })
  })
  const scoped = client.scope(NAMESPACE)
  console.error(`✓ 中继已连接: ${baseURL}`)
  return { client, scoped }
}

// ---------- 采集：探针同款遍历（模拟器内核侧） ----------

const PROBE_WALK_SOURCE = `() => {
  const MAX_DEPTH = 10
  const nameOf = (vm) => {
    const internal = vm && (vm.$ || vm)
    const t = internal && internal.type
    return (t && (t.__name || t.name)) || (vm && vm.$options && vm.$options.name) || 'Anon'
  }
  const uidOf = (vm) => {
    const internal = vm && (vm.$ || vm)
    return (internal && (internal.uid != null ? internal.uid : internal._uid)) ?? null
  }
  // 与 probes/runtime/tree.ts 对齐：死实例及其子树剪掉、visited 防环、maxDepth 10
  const walk = (vm, depth, visited, acc) => {
    if (!vm || depth >= MAX_DEPTH || visited.has(vm)) return
    visited.add(vm)
    const internal = vm.$ || vm
    if (internal.isUnmounted || internal._isDestroyed) { acc.dead++; return }
    acc.alive.push({ name: nameOf(vm), uid: uidOf(vm) })
    const kids = (internal.ctx && internal.ctx.$children) || vm.$children || []
    for (const kid of kids) walk(kid, depth + 1, visited, acc)
  }
  // 内核原始链规模（信息用）：uni-mp 卸载从不清 $children，死实例会持续累积
  const kernelWalk = (vm, depth, visited) => {
    if (!vm || depth >= MAX_DEPTH || visited.has(vm)) return 0
    visited.add(vm)
    const internal = vm.$ || vm
    let count = 1
    const kids = (internal.ctx && internal.ctx.$children) || vm.$children || []
    for (const kid of kids) count += kernelWalk(kid, depth + 1, visited)
    return count
  }
  const pages = getCurrentPages()
  const out = { pages: [], totalAlive: 0, totalDead: 0, totalKernel: 0 }
  for (const page of pages) {
    const acc = { route: page.route, alive: [], dead: 0 }
    acc.kernel = kernelWalk(page.$vm, 0, new Set())
    walk(page.$vm, 0, new Set(), acc)
    // 同页内 uid 撞车检测（切回重挂载后新旧实例同链的直接证据）
    const uidSeen = new Map()
    acc.dupUids = []
    for (const node of acc.alive) {
      const seen = uidSeen.get(node.uid) || 0
      uidSeen.set(node.uid, seen + 1)
    }
    for (const [uid, n] of uidSeen) if (n > 1) acc.dupUids.push(uid)
    out.pages.push(acc)
    out.totalAlive += acc.alive.length
    out.totalDead += acc.dead
    out.totalKernel += acc.kernel
  }
  return out
}`

// ---------- 采集：中继快照（面板真正消费的数据） ----------

function flattenRelay(tree) {
  const nodes = []
  for (const page of tree.pages ?? []) {
    const walkNode = (node) => {
      if (!node) return
      nodes.push({ id: node.id, name: node.name, route: page.route })
      for (const child of node.children ?? []) walkNode(child)
    }
    walkNode(page.components)
  }
  return nodes
}

function duplicatesOf(ids) {
  const seen = new Map()
  for (const id of ids) seen.set(id, (seen.get(id) || 0) + 1)
  return [...seen.entries()].filter(([, n]) => n > 1).map(([id]) => id)
}

async function relayStable(scoped, { timeout = 12000, interval = 700 } = {}) {
  // 推送有防抖 + 内容门：连续两次快照签名一致才算稳定
  let lastSig = ''
  let lastTree
  const start = Date.now()
  while (Date.now() - start < timeout) {
    try {
      lastTree = await scoped.rpc.call('get-component-tree')
      const flat = flattenRelay(lastTree)
      const sig = JSON.stringify([
        flat.map((n) => n.id),
        lastTree.pages?.map((p) => p.route),
      ])
      if (sig === lastSig) return lastTree
      lastSig = sig
    } catch {
      /* 中继瞬时不可达，继续重试 */
    }
    await sleep(interval)
  }
  if (lastTree) return lastTree
  throw new Error(
    '中继快照始终不可用——确认探针已连接（构建日志无 WebSocket 报错）',
  )
}

// ---------- 驱动：编译产物事件处理器 ----------

async function discoverHandlers(miniProgram) {
  // 页面 bindtap 被编译进 $scope，键名 e<序号>_<语义名>，真正处理函数挂在 invoker.value
  const handlers = await miniProgram.evaluate(() => {
    const scope = getCurrentPages()[0].$vm.$.ctx.$scope || {}
    const out = {}
    for (const key of Object.keys(scope)) {
      const match = /^e\d+_(.+)$/.exec(key)
      if (match && scope[key] && typeof scope[key].value === 'function')
        out[match[1]] = key
    }
    return out
  })
  if (!Object.keys(handlers).length)
    throw new Error(
      '页面 $scope 上没有发现 e*_ 形态的事件处理器——页面结构或编译产物变了',
    )
  console.error(`✓ 事件处理器: ${JSON.stringify(handlers)}`)
  return handlers
}

async function tapHandler(miniProgram, handlers, suffix) {
  const key = handlers[suffix]
  if (!key)
    throw new Error(
      `找不到事件处理器「${suffix}」，已有的: ${JSON.stringify(handlers)}`,
    )
  return miniProgram.evaluate((handlerKey) => {
    const scope = getCurrentPages()[0].$vm.$.ctx.$scope
    const invoker = scope[handlerKey]
    if (invoker && typeof invoker.value === 'function') {
      invoker.value()
      return true
    }
    return false
  }, key)
}

// ---------- 场景判定 ----------

function judge(label, relay, probe, options, baseline) {
  const flat = flattenRelay(relay)
  const dupIds = duplicatesOf(flat.map((n) => n.id))
  const reasons = []
  if (dupIds.length)
    reasons.push(`中继快照存在重复节点 id: ${dupIds.join(', ')}`)
  if (flat.length !== probe.totalAlive)
    reasons.push(
      `中继快照节点数(${flat.length}) !== 内核探针同款遍历存活数(${probe.totalAlive})——死实例泄漏或遍历规则漂移`,
    )
  const dupUidPages = probe.pages.filter((p) => p.dupUids.length > 0)
  if (dupUidPages.length)
    reasons.push(
      `内核存活链出现同页 uid 撞车: ${dupUidPages.map((p) => `${p.route}#${p.dupUids.join(',')}`).join('; ')}`,
    )
  if (options.pages !== undefined && relay.pages.length !== options.pages)
    reasons.push(`页面栈期望 ${options.pages} 个，实际 ${relay.pages.length}`)
  if (options.testComp !== undefined) {
    const count = flat.filter((n) => n.name === options.testComp.name).length
    if (count !== options.testComp.count)
      reasons.push(
        `${options.testComp.name} 期望 ${options.testComp.count} 个，实际 ${count}`,
      )
  }
  if (options.expectBaseline && baseline) {
    if (flat.length !== baseline.relayTotal)
      reasons.push(
        `回到基线后组件总数 ${flat.length} !== 基线 ${baseline.relayTotal}`,
      )
  }
  const info = {
    relayTotal: flat.length,
    probeAlive: probe.totalAlive,
    kernelChain: probe.totalKernel,
    deadInChain: probe.totalDead,
    pages: relay.pages.map((p) => p.route),
  }
  if (reasons.length) {
    console.error(`  ✗ ${label}: ${reasons.join('；')}`)
    console.error(`    ${JSON.stringify(info)}`)
    return { name: label, pass: false, reasons, info }
  }
  console.error(`  ✓ ${label}: ${JSON.stringify(info)}`)
  return { name: label, pass: true, reasons: [], info }
}

async function collect(miniProgram, scoped) {
  await sleep(1200) // 渲染 + 探针 300ms 防抖
  const relay = await relayStable(scoped)
  const probe = await miniProgram.evaluate(
    new Function(`return (${PROBE_WALK_SOURCE})`)(),
  )
  return { relay, probe }
}

// ---------- 场景实现 ----------

const SCENARIOS = {
  async baseline(ctx) {
    await sleep(2000)
    const { relay, probe } = await collect(ctx.miniProgram, ctx.scoped)
    ctx.baseline = {
      relayTotal: flattenRelay(relay).length,
      probeTotal: probe.totalAlive,
    }
    return judge(
      'baseline',
      relay,
      probe,
      { testComp: { name: 'TestComp', count: 1 } },
      ctx.baseline,
    )
  },

  'tab-switch': async function (ctx) {
    await tapHandler(ctx.miniProgram, ctx.handlers, 'LEGACY')
    await sleep(1200)
    const mid = await collect(ctx.miniProgram, ctx.scoped)
    const midResult = judge(
      'tab-switch(切走)',
      mid.relay,
      mid.probe,
      {},
      ctx.baseline,
    )

    await tapHandler(ctx.miniProgram, ctx.handlers, 'ALL')
    const back = await collect(ctx.miniProgram, ctx.scoped)
    const backResult = judge(
      'tab-switch(切回)',
      back.relay,
      back.probe,
      { expectBaseline: true, testComp: { name: 'TestComp', count: 1 } },
      ctx.baseline,
    )
    return mergeResults('tab-switch', [midResult, backResult])
  },

  'rapid-switch': async function (ctx) {
    // <200ms 间隔连续切换，压过防抖窗口；结束后必须能收敛回基线
    for (let i = 0; i < 10; i++) {
      await tapHandler(
        ctx.miniProgram,
        ctx.handlers,
        i % 2 === 0 ? 'LEGACY' : 'ALL',
      )
      await sleep(150)
    }
    await tapHandler(ctx.miniProgram, ctx.handlers, 'ALL')
    await sleep(2500)
    const { relay, probe } = await collect(ctx.miniProgram, ctx.scoped)
    return judge(
      'rapid-switch',
      relay,
      probe,
      { expectBaseline: true, testComp: { name: 'TestComp', count: 1 } },
      ctx.baseline,
    )
  },

  async navigation(ctx) {
    await ctx.miniProgram.evaluate(() =>
      uni.navigateTo({ url: '/pages/hi?name=e2e' }),
    )
    await sleep(2500)
    const pushed = await collect(ctx.miniProgram, ctx.scoped)
    const pushedResult = judge(
      'navigation(压栈)',
      pushed.relay,
      pushed.probe,
      { pages: 2 },
      ctx.baseline,
    )

    await ctx.miniProgram.evaluate(() => uni.navigateBack())
    await sleep(2500)
    const back = await collect(ctx.miniProgram, ctx.scoped)
    const backResult = judge(
      'navigation(回栈)',
      back.relay,
      back.probe,
      { pages: 1, expectBaseline: true },
      ctx.baseline,
    )
    return mergeResults('navigation', [pushedResult, backResult])
  },

  async keepalive(ctx) {
    // 尽力而为：KeepAlive 三个 Tab 按钮的处理器是子组件 scope 上的纯序号键（e0/e1/e2），
    // 语义未知，做法是全量轮一遍——无论落在哪个 Tab，可见组件数恒定
    const keys = await ctx.miniProgram.evaluate(() => {
      const nameOf = (vm) => {
        const internal = vm && (vm.$ || vm)
        const t = internal && internal.type
        return (t && (t.__name || t.name)) || 'Anon'
      }
      let target = null
      const walk = (vm, depth, visited) => {
        if (!vm || depth > 10 || visited.has(vm) || target) return
        visited.add(vm)
        if (nameOf(vm) === 'DynamicKeepAliveDemo') {
          target = vm
          return
        }
        const internal = vm.$ || vm
        const kids = (internal.ctx && internal.ctx.$children) || []
        for (const kid of kids) walk(kid, depth + 1, visited)
      }
      walk(getCurrentPages()[0].$vm, 0, new Set())
      if (!target) return null
      const scope = target.$.ctx.$scope || {}
      return Object.keys(scope).filter(
        (k) =>
          /^e\d+$/.test(k) && scope[k] && typeof scope[k].value === 'function',
      )
    })
    if (!keys || keys.length === 0)
      return {
        name: 'keepalive',
        pass: true,
        reasons: [],
        info: { skipped: '未找到 DynamicKeepAliveDemo（页面结构变化），跳过' },
      }

    console.error(`  … KeepAlive 处理器轮换: ${keys.join(', ')}`)
    for (let round = 0; round < 2; round++) {
      for (const key of keys) {
        await ctx.miniProgram.evaluate((handlerKey) => {
          const page = getCurrentPages()[0].$vm
          // 子组件处理器在页面 scope 上不可见，需从组件实例出发
          const find = (vm, depth, visited) => {
            if (!vm || depth > 10 || visited.has(vm)) return null
            visited.add(vm)
            const internal = vm.$ || vm
            if (
              internal.ctx &&
              internal.ctx.$scope &&
              internal.ctx.$scope[handlerKey]
            )
              return internal.ctx.$scope[handlerKey]
            const kids = (internal.ctx && internal.ctx.$children) || []
            for (const kid of kids) {
              const hit = find(kid, depth + 1, visited)
              if (hit) return hit
            }
            return null
          }
          const invoker = find(page, 0, new Set())
          if (invoker && typeof invoker.value === 'function') invoker.value()
        }, key)
        await sleep(600)
      }
    }
    const { relay, probe } = await collect(ctx.miniProgram, ctx.scoped)
    return judge(
      'keepalive',
      relay,
      probe,
      { expectBaseline: true },
      ctx.baseline,
    )
  },

  async chaos(ctx) {
    const rand = mulberry32(ctx.args.seed)
    const suffixes = Object.keys(ctx.handlers)
    const deadline = Date.now() + ctx.args.chaosMs
    console.error(
      `  … chaos ${ctx.args.chaosMs}ms，seed=${ctx.args.seed}（复现：--seed ${ctx.args.seed}）`,
    )
    let actions = 0
    while (Date.now() < deadline) {
      if (rand() < 0.85) {
        await tapHandler(
          ctx.miniProgram,
          ctx.handlers,
          suffixes[Math.floor(rand() * suffixes.length)],
        )
        actions++
        await sleep(100 + Math.floor(rand() * 800))
      } else {
        await sleep(300)
      }
    }
    console.error(`  … chaos 完成（${actions} 次交互），收敛回 ALL`)
    await tapHandler(ctx.miniProgram, ctx.handlers, 'ALL')
    await sleep(2500)
    const { relay, probe } = await collect(ctx.miniProgram, ctx.scoped)
    return judge(
      'chaos',
      relay,
      probe,
      { expectBaseline: true, testComp: { name: 'TestComp', count: 1 } },
      ctx.baseline,
    )
  },
}

function mergeResults(name, results) {
  const failed = results.filter((r) => !r.pass)
  return {
    name,
    pass: failed.length === 0,
    reasons: failed.flatMap((r) => r.reasons),
    info: results.map((r) => ({ step: r.name, ...r.info })),
  }
}

// ---------- 主流程 ----------

async function main() {
  const args = parseArgs(process.argv)
  if (args.help) {
    printHelp()
    return 0
  }
  await requireDeps(args)

  const spawned = { build: undefined, ide: undefined }
  process.on('SIGINT', () => {
    console.error('\n中断：清理子进程…')
    spawned.build?.()
    spawned.ide?.kill('SIGTERM')
    process.exit(130)
  })

  // 1. 构建 / sidecar
  let baseURL = args.baseUrl
  let token = args.token
  if (args.build) {
    console.error(
      `… 启动 pnpm ${args.devScript}（等待 sidecar + Build complete）`,
    )
    const build = await startBuildWatcher(args)
    spawned.build = build.cleanup
    baseURL = build.baseURL
    token = build.token
  } else if (!baseURL || !token) {
    console.error(
      '未指定 sidecar。二选一：\n  a) --build 由脚本自己起构建\n  b) --base-url <url> --token <token>（token 来自 dev:mp-weixin 日志的 devframe_auth_token）',
    )
    return 2
  }

  // 2. IDE + 模拟器（合并编排：端口就绪 + 模拟器真正可驱动）
  const { miniProgram, ideChild } = await ensureIdeAndAutomator(args)
  spawned.ide = ideChild

  // 3. 中继
  const { client, scoped } = await connectRelay(baseURL, token)

  // 4. 场景
  const handlers = await discoverHandlers(miniProgram)
  const ctx = { miniProgram, scoped, handlers, args, baseline: undefined }
  const requested = args.scenarios
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const unknown = requested.filter((s) => !SCENARIOS[s])
  if (unknown.length) {
    console.error(
      `未知场景: ${unknown.join(', ')}；可选: ${Object.keys(SCENARIOS).join(', ')}`,
    )
    return 2
  }

  const results = []
  for (const name of requested) {
    console.error(`\n▶ 场景 ${name}`)
    try {
      results.push(await SCENARIOS[name](ctx))
    } catch (err) {
      console.error(`  ✗ ${name}: ${err.message}`)
      await dumpArtifacts(name, {
        error: err.message,
        handlers,
        baseline: ctx.baseline,
      })
      results.push({ name, pass: false, reasons: [err.message], info: {} })
    }
  }

  // 5. 汇总
  console.error('\n===== 结果 =====')
  for (const r of results) {
    console.error(
      `  ${r.pass ? '✓' : '✗'} ${r.name}${r.pass ? '' : ` — ${r.reasons.join('；')}`}`,
    )
  }
  const failed = results.filter((r) => !r.pass)
  const failedNames = failed.map((r) => r.name)
  if (failedNames.length) {
    await dumpArtifacts('failed', {
      failed: failedNames,
      results,
      baseline: ctx.baseline,
    })
  }
  console.error(
    failedNames.length
      ? `\n✗ ${failedNames.length}/${results.length} 个场景失败`
      : '\n✓ 全部场景通过',
  )

  // 6. 清理
  try {
    await miniProgram.disconnect()
  } catch {
    /* 已断开 */
  }
  try {
    await client.close?.()
  } catch {
    /* 已关闭 */
  }
  if (!args.keepBuild) {
    spawned.build?.()
  }
  if (!args.keepIde) {
    spawned.ide?.kill('SIGTERM')
  }
  return failedNames.length ? 1 : 0
}

process.exitCode = 1
main()
  .then((code) => {
    process.exitCode = code
  })
  .catch((err) => {
    console.error(`\n环境错误: ${err.message}`)
    process.exitCode = 2
  })
