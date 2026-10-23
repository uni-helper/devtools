import { describe, expect, it } from 'vitest'
import {
  TAGGED_TYPE_KEY,
  reviveTaggedValues,
  tagMap,
  tagSet,
} from '../src/utils/tagged-value'

describe('Map / Set 的 JSON 标记编码', () => {
  it('经过 JSON 往返后能还原成真正的 Map / Set，非字符串键保留', () => {
    const wire = JSON.parse(
      JSON.stringify({
        meta: tagMap([
          ['env', 'dev'],
          [1, { nested: tagSet(['a', 'b']) }],
        ]),
      }),
    )

    const revived = reviveTaggedValues(wire) as { meta: Map<unknown, any> }

    expect(revived.meta).toBeInstanceOf(Map)
    expect(revived.meta.get('env')).toBe('dev')
    expect(revived.meta.get(1).nested).toEqual(new Set(['a', 'b']))
  })

  it('形状不完整的同名键不当作标记，原样保留', () => {
    const userData = { [TAGGED_TYPE_KEY]: 'Map', entries: 'not-an-array' }

    expect(reviveTaggedValues(userData)).toEqual(userData)
  })

  it('普通值与数组原样返回', () => {
    expect(reviveTaggedValues([1, 'a', null, { x: [true] }])).toEqual([
      1,
      'a',
      null,
      { x: [true] },
    ])
  })
})
