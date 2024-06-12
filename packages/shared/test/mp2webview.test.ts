import { expect, it } from 'vitest'
import { compressURLQuery, decompressURLQuery } from './../src'

it('should compress url query', () => {
  const data = {
    url: 'https://www.example.com',
    query: {
      key1: 'value1',
      key2: 'value2',
    },
  }

  expect(compressURLQuery(data)).toMatchInlineSnapshot(`"N4IgrgTgNiBcIAsAuSAOBnWB6LB3fAdAKYAeAhgLapREEDGA9hSADQgCOYREAnnKAGsiPAIxwQANzJQuYtkJ4AmcVJlFlAXw1A"`)
})

it('should decompress url query', () => {
  const data = 'N4IgrgTgNiBcIAsAuSAOBnWB6LB3fAdAKYAeAhgLapREEDGA9hSADQgCOYREAnnKAGsiPAIxwQANzJQuYtkJ4AmcVJlFlAXw1A'

  expect(decompressURLQuery(data)).toMatchInlineSnapshot(`
    {
      "query": {
        "key1": "value1",
        "key2": "value2",
      },
      "url": "https://www.example.com",
    }
  `)
})

it('should compress & decompress', () => {
  const data = {
    url: 'https://www.example.com',
    query: {
      key1: 'value1',
      key2: 'value2',
    },
  }

  const compressed = compressURLQuery(data)
  const decompressed = decompressURLQuery(compressed)

  expect(decompressed).toEqual(data)
})
