import { reactive } from 'vue'
import { describe, expect, it } from 'vitest'
import { reviveTaggedValues } from '@uni-helper/devtools-shared/utils/tagged-value'
import { ensureJsonSafe } from '../src/runtime/serialize'

describe('状态序列化：Map / Set 不再丢内容', () => {
  it('Map / Set 编码后过 JSON 不丢数据，面板侧能还原', () => {
    const wire = ensureJsonSafe({
      meta: new Map<unknown, unknown>([
        ['env', 'dev'],
        [42, { deep: new Set(['read', 'write']) }],
      ]),
    })

    const revived = reviveTaggedValues(wire) as { meta: Map<unknown, any> }
    expect(revived.meta.get('env')).toBe('dev')
    expect(revived.meta.get(42).deep).toEqual(new Set(['read', 'write']))
  })

  it('reactive 包装的 Map / Set 同样能序列化', () => {
    const state = reactive({
      lookup: new Map([['key', 'value']]),
      tags: new Set(['x']),
    })

    const revived = reviveTaggedValues(ensureJsonSafe(state)) as {
      lookup: Map<string, string>
      tags: Set<string>
    }
    expect(revived.lookup.get('key')).toBe('value')
    expect([...revived.tags]).toEqual(['x'])
  })

  it('Map 里的不可序列化值照旧标为 <unserializable>，不影响其余条目', () => {
    const revived = reviveTaggedValues(
      ensureJsonSafe(
        new Map<string, unknown>([
          ['fn', () => 1],
          ['n', 1],
        ]),
      ),
    ) as Map<string, unknown>

    expect(revived.get('fn')).toBe('<unserializable>')
    expect(revived.get('n')).toBe(1)
  })
})
