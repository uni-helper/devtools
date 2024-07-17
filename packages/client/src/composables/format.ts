import { isArray, isPlainObject } from '@uni-helper/devtools-shared'

export function getStateValueType(value: unknown) {
  const type = typeof value
  if (value === null) {
    return 'null'
  }
  else if (type === 'undefined') {
    return 'undefined'
  }
  else if (
    type === 'boolean'
      || type === 'number'
      || type === 'symbol'
  ) {
    return 'literal'
  }
  else if (type === 'bigint') {
    return 'bigint'
  }
  else if (type === 'string') {
    return 'string'
  }
  else if (isArray(value)) {
    return 'array'
  }
  else if (isPlainObject(value)) {
    return 'plain-object'
  }
  else if (isSet(value)) {
    return 'set'
  }
  else {
    return 'unknown'
  }
}

export function formatStateValue(value: unknown) {
  const type = getStateValueType(value)
  const color = stateTypeColorMap[type]
  if (type === 'null') {
    return {
      rawType: 'null',
      rawDisplay: 'null',
      value: 'null',
      color,
    }
  }
  else if (type === 'undefined') {
    return {
      rawType: 'undefined',
      rawDisplay: 'undefined',
      value: 'undefined',
      color,
    }
  }
  else if (type === 'literal') {
    return {
      rawType: 'literal',
      rawDisplay: `${value}`,
      value: `${value}`,
      color,
    }
  }
  else if (type === 'bigint') {
    return {
      rawType: type,
      rawDisplay: `${value}n`,
      value: `${value}`,
      color,
    }
  }
  else if (type === 'string') {
    return {
      rawType: 'string',
      rawDisplay: `"${value}"`,
      value: `"${value}"`,
      color,
    }
  }
  else if (type === 'array') {
    return {
      rawType: 'array',
      rawDisplay: `Array(${(value as []).length})`,
      value,
      color,
    }
  }
  else if (type === 'set') {
    return {
      rawType: 'set',
      rawDisplay: Array.from(value as Set<any>),
      value,
      color,
    }
  }
  else if (type === 'plain-object') {
    return {
      rawType: 'plain-object',
      rawDisplay: `{...}`,
      value,
      color,
    }
  }
  else {
    return {
      rawType: 'unknown',
      rawDisplay: `${value}`,
      value: `${value}`,
      color,
    }
  }
}
