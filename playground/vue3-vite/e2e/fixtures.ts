import process from 'node:process'
import type { Frame, Page } from '@playwright/test'
import {
  test as base,
  expect,
  type MiniProgram,
} from '@open-wxa/wxa-runner-playwright'

export { expect }

type Rpc = (name: string, ...args: unknown[]) => Promise<any>

/** 每个 worker 一条面板同款的 devframe 连接，所有用例共用 */
export const test = base.extend<object, { rpc: Rpc }>({
  rpc: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      const baseURL = process.env.UNI_E2E_BASE_URL!
      // devframe client 面向浏览器，node 下补它读取的最小全局
      const g = globalThis as any
      g.location ??= new URL(baseURL)
      g.window ??= globalThis
      const { connectDevframe } = await import('devframe/client')
      const client = await connectDevframe({
        baseURL,
        authToken: process.env.UNI_E2E_TOKEN!,
        simpleAuth: false,
        otpParam: false,
      })
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error(`连接 sidecar 超时：${baseURL}`)),
          15_000,
        )
        client.events.on('connection:status', (status: string) => {
          if (status === 'connected') {
            clearTimeout(timer)
            resolve()
          } else if (status === 'unauthorized' || status === 'error') {
            clearTimeout(timer)
            reject(new Error(`连接 sidecar 失败：${status}`))
          }
        })
      })
      const scoped = client.scope('uni-helper-devtools')
      await use((name, ...args) => scoped.rpc.call(name, ...args))
    },
    { scope: 'worker' },
  ],
})

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export function tap(miniProgram: MiniProgram, text: string) {
  return miniProgram.current.getByText(text, { exact: true }).click()
}

export interface FlatNode {
  id: string
  name: string
  route: string
}

export function flatten(tree: any): FlatNode[] {
  const out: FlatNode[] = []
  for (const page of tree?.pages ?? []) {
    const walk = (node: any) => {
      if (!node) return
      out.push({ id: node.id, name: node.name, route: page.route })
      for (const child of node.children ?? []) walk(child)
    }
    walk(page.components)
  }
  return out
}

function appService(page: Page): Frame {
  const frame = page
    .frames()
    .find((f) => f.url().includes('/__wxa__/appservice.html'))
  if (!frame) throw new Error('找不到 wxa-runner 的逻辑层 frame')
  return frame
}

/**
 * 在逻辑层按探针同款规则遍历存活实例：mp 下 subTree 为空，ctx.$children 是唯一
 * 路径；uni-mp 卸载从不清链，死实例及其子树要剪掉（同 probes/src/runtime/tree.ts）
 */
function kernelWalk(page: Page) {
  return appService(page).evaluate(() => {
    const MAX_DEPTH = 10
    const pages: { route: string; uids: number[] }[] = []
    const walk = (vm: any, depth: number, seen: Set<any>, uids: number[]) => {
      if (!vm || depth >= MAX_DEPTH || seen.has(vm)) return
      seen.add(vm)
      const internal = vm.$ || vm
      if (internal.isUnmounted || internal._isDestroyed) return
      uids.push(internal.uid)
      for (const kid of internal.ctx?.$children ?? [])
        walk(kid, depth + 1, seen, uids)
    }
    for (const p of (globalThis as any).getCurrentPages()) {
      const uids: number[] = []
      walk(p.$vm, 0, new Set(), uids)
      pages.push({ route: p.route, uids })
    }
    return pages
  })
}

/**
 * 核对面板看到的组件树与逻辑层一致：无重复 id、节点数等于存活实例数、
 * 同页 uid 不撞车。探针推送有防抖，先等两边收敛再断言
 */
export async function verifyTree(page: Page, rpc: Rpc, label: string) {
  let tree: any
  let flat: FlatNode[] = []
  let kernel: Awaited<ReturnType<typeof kernelWalk>> = []
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    await sleep(500)
    tree = await rpc('get-component-tree').catch(() => undefined)
    flat = flatten(tree)
    kernel = await kernelWalk(page)
    const routesMatch =
      JSON.stringify(tree?.pages?.map((p: any) => p.route)) ===
      JSON.stringify(kernel.map((p) => p.route))
    const alive = kernel.reduce((n, p) => n + p.uids.length, 0)
    if (routesMatch && flat.length === alive) break
  }

  const ids = flat.map((n) => n.id)
  expect(new Set(ids).size, `${label}：组件树有重复 id`).toBe(ids.length)
  expect(
    tree.pages.map((p: any) => p.route),
    `${label}：页面栈`,
  ).toEqual(kernel.map((p) => p.route))
  expect(
    flat.length,
    `${label}：组件树节点数应等于逻辑层存活实例数（不等 = 死实例泄漏或遍历规则漂移）`,
  ).toBe(kernel.reduce((n, p) => n + p.uids.length, 0))
  for (const p of kernel)
    expect(new Set(p.uids).size, `${label}：${p.route} 存活实例 uid 撞车`).toBe(
      p.uids.length,
    )

  const count = (name: string) => flat.filter((n) => n.name === name).length
  return { tree, flat, count }
}
