import { expect, sleep, tap, test, verifyTree } from './fixtures'

// 场景页 /pages/component-tree：用例按按钮文字点击，改按钮 label 要同步改这里
const PAGE = 'pages/component-tree'

test('增删、切换、复位后组件树与逻辑层一致', async ({
  miniProgram,
  page,
  rpc,
}) => {
  await miniProgram.open(PAGE)
  const base = await verifyTree(page, rpc, 'baseline')
  expect(base.count('TreeGroup')).toBe(1)
  expect(base.count('GroupLeaf')).toBe(3)
  expect(base.count('ListRow')).toBe(3)
  expect(base.count('PanelA')).toBe(1)

  await tap(miniProgram, '隐藏 TreeGroup')
  await expect(miniProgram.current.getByText('（已隐藏）')).toBeVisible()
  let s = await verifyTree(page, rpc, 'hide-group')
  expect(s.count('TreeGroup')).toBe(0)
  expect(s.count('GroupLeaf')).toBe(0)

  await tap(miniProgram, '显示 TreeGroup')
  s = await verifyTree(page, rpc, 'show-group')
  expect(s.count('TreeGroup')).toBe(1)
  expect(s.count('GroupLeaf')).toBe(3)

  await tap(miniProgram, '列表 +1 行')
  await tap(miniProgram, '列表 +1 行')
  s = await verifyTree(page, rpc, 'add-row')
  expect(s.count('ListRow')).toBe(5)
  await tap(miniProgram, '列表 -1 行')
  s = await verifyTree(page, rpc, 'remove-row')
  expect(s.count('ListRow')).toBe(4)

  // 小程序没有 KeepAlive：切走即卸载，旧 Panel 不能残留在树里
  for (const panel of ['B', 'C', 'A']) {
    await tap(miniProgram, `切到 ${panel}`)
    await expect(
      miniProgram.current.getByText(`当前 ${panel}`, { exact: false }),
    ).toBeVisible()
    s = await verifyTree(page, rpc, `panel-${panel}`)
    expect(s.flat.filter((n) => /^Panel[ABC]$/.test(n.name))).toEqual([
      expect.objectContaining({ name: `Panel${panel}` }),
    ])
  }

  await tap(miniProgram, '复位')
  s = await verifyTree(page, rpc, 'reset')
  expect(s.flat.length).toBe(base.flat.length)
})

test('快速切换（<200ms 间隔）后无死实例泄漏', async ({
  miniProgram,
  page,
  rpc,
}) => {
  await miniProgram.open(PAGE)
  const base = await verifyTree(page, rpc, 'baseline')
  const sequence = [
    '隐藏 TreeGroup',
    '切到 B',
    '显示 TreeGroup',
    '切到 C',
    '隐藏 TreeGroup',
    '切到 A',
    '显示 TreeGroup',
  ]
  for (let round = 0; round < 3; round++) {
    for (const text of sequence) {
      await tap(miniProgram, text)
      await sleep(120)
    }
  }
  const s = await verifyTree(page, rpc, 'rapid-switch')
  expect(s.count('TreeGroup')).toBe(1)
  expect(s.count('PanelA')).toBe(1)
  expect(s.flat.length).toBe(base.flat.length)
})

test('chaos：固定种子的随机操作序列', async ({ miniProgram, page, rpc }) => {
  await miniProgram.open(PAGE)
  const base = await verifyTree(page, rpc, 'baseline')
  // mulberry32：固定种子保证失败可复现
  let seed = 20261008
  const random = () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const actions = [
    '隐藏 TreeGroup',
    '显示 TreeGroup',
    '列表 +1 行',
    '列表 -1 行',
    '切到 A',
    '切到 B',
    '切到 C',
  ]
  for (let i = 1; i <= 40; i++) {
    await tap(miniProgram, actions[Math.floor(random() * actions.length)])
    await sleep(Math.floor(random() * 250))
    if (i % 10 === 0) await verifyTree(page, rpc, `chaos#${i}`)
  }
  await tap(miniProgram, '复位')
  const s = await verifyTree(page, rpc, 'chaos-reset')
  expect(s.flat.length).toBe(base.flat.length)
})

test('跳转 detail 后页面栈为 2，返回后回到 1', async ({
  miniProgram,
  page,
  rpc,
}) => {
  await miniProgram.open(PAGE)
  const base = await verifyTree(page, rpc, 'baseline')

  await miniProgram.navigateTo('/pages/detail?id=42')
  await expect(miniProgram).toHavePath('pages/detail')
  let s = await verifyTree(page, rpc, 'navigate')
  expect(s.tree.pages.map((p: any) => p.route)).toEqual([PAGE, 'pages/detail'])
  const router = await rpc('get-router-info')
  expect(router.currentRoute).toMatchObject({
    path: '/pages/detail',
    query: { id: '42' },
  })
  expect(router.stack).toHaveLength(2)

  await miniProgram.navigateBack()
  await expect(miniProgram).toHavePath(PAGE)
  s = await verifyTree(page, rpc, 'back')
  expect(s.tree.pages).toHaveLength(1)
  expect(s.flat.length).toBe(base.flat.length)
})
