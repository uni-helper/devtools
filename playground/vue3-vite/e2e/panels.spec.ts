import { expect, sleep, tap, test, verifyTree } from './fixtures'

test('navigate-to 驱动小程序跳转', async ({ miniProgram, rpc }) => {
  await miniProgram.open('pages/index')
  await sleep(1500)
  await rpc('navigate-to', { path: '/pages/detail' })
  await expect(miniProgram).toHavePath('pages/detail')
})

test('组件状态：读取 setup 状态，改写后页面跟着变', async ({
  miniProgram,
  page,
  rpc,
}) => {
  await miniProgram.open('pages/setup-state')
  const { flat } = await verifyTree(page, rpc, 'setup-state')
  const id = flat.find((n) => n.name === 'setup-state')!.id

  const state = await rpc('get-component-state', { id })
  expect(state.setup.count.value).toBe(1)
  expect(state.setup.double.value).toBe(2)
  expect(state.setup.user.value).toEqual({
    name: 'Ada',
    age: 36,
    address: { city: '杭州' },
  })

  await rpc('update-component-state', {
    id,
    section: 'setup',
    path: ['count'],
    value: 5,
  })
  await expect(
    miniProgram.current.getByText('count = 5 · double = 10'),
  ).toBeVisible()

  // 可写 computed：setter 把值拆回 firstName / lastName
  await rpc('update-component-state', {
    id,
    section: 'setup',
    path: ['fullName'],
    value: 'Grace Hopper',
  })
  await expect(
    miniProgram.current.getByText('firstName = Grace，lastName = Hopper', {
      exact: false,
    }),
  ).toBeVisible()

  await rpc('update-component-state', {
    id,
    section: 'setup',
    path: ['user', 'address', 'city'],
    value: '上海',
  })
  await expect(
    miniProgram.current.getByText('· 上海 ·', { exact: false }),
  ).toBeVisible()
})

test('Pinia：store 列表、特殊值序列化、双向同步', async ({
  miniProgram,
  rpc,
}) => {
  await miniProgram.open('pages/pinia')
  await sleep(1500)
  const { stores } = await rpc('get-pinia-stores')
  expect(stores.map((s: any) => s.id).sort()).toEqual(['counter', 'profile'])

  let counter = await rpc('get-pinia-state', { id: 'counter' })
  expect(counter.state).toMatchObject({
    lookup: { __uni_devtools_type__: 'Map', entries: [['key', 'value']] },
    tags: { __uni_devtools_type__: 'Set', values: ['x', 'y'] },
    big: '12345678901234567890',
    token: '<unserializable>',
  })

  await tap(miniProgram, 'counter.increment()')
  await expect(
    miniProgram.current.getByText('counter.count = 1 · double = 2'),
  ).toBeVisible()
  counter = await rpc('get-pinia-state', { id: 'counter' })
  expect(counter.state.count).toBe(1)
  expect(counter.getters.double).toBe(2)

  await rpc('update-pinia-state', { id: 'counter', key: 'count', value: 10 })
  await expect(
    miniProgram.current.getByText('counter.count = 10 · double = 20'),
  ).toBeVisible()
})

test('Storage：写入后 get-storage-info / get-storage-entries 立即可见', async ({
  miniProgram,
  rpc,
}) => {
  await miniProgram.open('pages/storage')
  await tap(miniProgram, 'setStorageSync(demo_user)')
  await tap(miniProgram, 'setStorage(demo_token)')
  await expect(
    miniProgram.current.getByText(/^\s*当前 keys：.*demo_token/),
  ).toBeVisible()

  const info = await rpc('get-storage-info')
  expect(info.keys).toEqual(
    expect.arrayContaining(['demo_user', 'demo_token']),
  )
  const { entries } = await rpc('get-storage-entries', { keys: ['demo_user'] })
  expect(entries).toEqual([
    { key: 'demo_user', value: { name: 'Ada', level: 3 } },
  ])
})

test('Network：GET / POST / 失败请求都被探针记录', async ({
  miniProgram,
  rpc,
}) => {
  // 拦下发往 httpbin 的请求，不依赖外网；探针包在 uni.request 外层，照样记录。
  // 「必失败」走 .invalid 域名，不拦，真实地 DNS 失败
  await miniProgram.route('GET https://httpbin.org/get*', {
    status: 200,
    body: { ok: true },
  })
  await miniProgram.route('POST https://httpbin.org/post', (request) => ({
    status: 200,
    body: { json: request.body },
  }))
  await miniProgram.open('pages/network')
  await sleep(1500)
  await rpc('clear-network-records')

  await tap(miniProgram, 'GET（回调式）')
  await expect(miniProgram.current.getByText('GET 200')).toBeVisible()
  await tap(miniProgram, 'POST（Promise 式）')
  await expect(
    miniProgram.current.getByText('POST 200', { exact: false }),
  ).toBeVisible()
  await tap(miniProgram, '必失败')
  await expect(
    miniProgram.current.getByText('预期失败', { exact: false }),
  ).toBeVisible()

  await expect
    .poll(async () => (await rpc('get-network-records')).records.length)
    .toBe(3)
  const { records } = await rpc('get-network-records')
  expect(records[0]).toMatchObject({ method: 'GET', status: 200, ok: true })
  expect(records[1]).toMatchObject({
    method: 'POST',
    status: 200,
    ok: true,
    requestBody: { source: 'playground', step: 1 },
  })
  expect(records[2]).toMatchObject({ ok: false })
  expect(JSON.stringify(records[2])).toContain('request:fail')
})
