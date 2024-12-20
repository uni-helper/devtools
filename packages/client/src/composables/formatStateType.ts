export interface StateType {
  value: unknown
  rawType: string
  rawDisplay?: string
  recursive: boolean
}
export const objectToString = Object.prototype.toString
export const isArray = Array.isArray
export function isMap(val: unknown): val is Map<any, any> {
  return toTypeString(val) === '[object Map]'
}
export function toTypeString(value: unknown): string {
  return objectToString.call(value)
}
export function isSet(val: unknown): val is Set<any> {
  return toTypeString(val) === '[object Set]'
}
export function isRegExp(val: unknown): val is RegExp {
  return toTypeString(val) === '[object RegExp]'
}
export function isPlainObject(val: unknown): val is object {
  return toTypeString(val) === '[object Object]'
}
function getFunctionDetails(func: Function) {
  let string = ''
  let matches = null
  try {
    string = Function.prototype.toString.call(func)
    matches = String.prototype.match.call(string, /\([\s\S]*?\)/)
  }
  catch (e) {
  }
  const match = matches && matches[0]
  const args = typeof match === 'string'
    ? match
    : '(?)'
  const name = typeof func.name === 'string' ? func.name : ''
  return `<span style="opacity:.5;">function</span> ${escape(name)}${args}`
}

function formatWithExtraType(value: unknown, type: string) {
  return `${value} <span style="color:#6b7280;padding:'0 5px';">(${type})</span>`
}

export function toRawType(value: unknown): string {
  // extract "RawType" from strings like "[object RawType]"
  return toTypeString(value).slice(8, -1)
}

export function formatStateType(value: unknown): StateType {
  // Vue
  // if (isComputed(value)) {
  //   const state = formatStateType((value as ComputedRef).value)
  //   return {
  //     ...state,
  //     ...(state.recursive
  //       ? { rawDisplay: formatWithExtraType(state.rawDisplay, 'Computed') }
  //       : { value: formatWithExtraType(state.value, 'Computed') }),
  //   }
  // }
  // else if (isRef(value)) {
  //   const state = formatStateType(toRaw(value.value))
  //   return {
  //     ...state,
  //     ...(state.recursive
  //       ? { rawDisplay: formatWithExtraType(state.rawDisplay, 'Ref') }
  //       : { value: formatWithExtraType(state.value, 'Ref') }),
  //   }
  // }
  // else if (isReactive(value)) {
  //   const state = formatStateType(toRaw(value))
  //   return {
  //     ...state,
  //     ...(state.recursive
  //       ? { rawDisplay: formatWithExtraType(state.rawDisplay, 'Reactive') }
  //       : { value: formatWithExtraType(state.value, 'Reactive') }),
  //   }
  // }

  if (isArray(value)) {
    return {
      rawType: 'object',
      rawDisplay: `Array(${value.length})`,
      recursive: true,
      value,
    }
  }
  else if (typeof value === 'function') {
    return {
      rawType: 'function',
      recursive: false,
      value: getFunctionDetails(value),
    }
  }
  else if (typeof value === 'bigint') {
    const stringifiedBigInt = BigInt.prototype.toString.call(value)
    return {
      rawType: 'string',
      rawDisplay: `BigInt(${stringifiedBigInt})`,
      recursive: false,
      value: stringifiedBigInt,
    }
  }
  else if (Number.isNaN(value)) {
    return {
      rawType: 'literal',
      recursive: false,
      value: 'NaN',
    }
  }
  else if (value === Infinity) {
    return {
      rawType: 'literal',
      recursive: false,
      value: 'Infinity',
    }
  }
  else if (value === -Infinity) {
    return {
      rawType: 'literal',
      recursive: false,
      value: '-Infinity',
    }
  }
  else if (typeof value === 'symbol') {
    return {
      rawType: 'literal',
      recursive: false,
      value: Symbol.prototype.toString.call(value),
    }
  }
  else if (value === null) {
    return {
      rawType: 'null',
      recursive: false,
      value: 'null',
    }
  }
  else if (typeof value === 'undefined') {
    return {
      rawType: 'null',
      recursive: false,
      value: 'undefined',
    }
  }
  else if (typeof value === 'string') {
    return {
      rawType: 'string',
      recursive: false,
      value: `"${value}"`,
    }
  }
  else if (value !== 'null' && typeof value === 'object') {
    if (isMap(value)) {
      return {
        rawType: 'object',
        rawDisplay: 'Map',
        recursive: true,
        value: Array.from(value.entries()).map(([key, value]) => ({ key, value })),
      }
    }
    else if (isSet(value)) {
      const list = Array.from(value)
      return {
        rawType: 'object',
        rawDisplay: `Set[${list.length}]`,
        recursive: true,
        value: list,
      }
    }
    else if (isRegExp(value)) {
      return {
        rawType: 'string',
        recursive: false,
        value: RegExp.prototype.toString.call(value),
      }
    }
    else if (toRawType(value) === 'Error') {
      return {
        rawType: 'string',
        recursive: false,
        // @ts-expect-error skip
        value: `${value?.message}: ${value?.stack}`,
      }
    }
    // @ts-expect-error skip
    else if ((value?.state && value._vm) || (value.constructor?.name === 'Store' && value._wrappedGetters)) {
      // TODO: Custom Store
      return {
        rawType: 'string',
        recursive: false,
        value: '"[object Store]"',
      }
    }
    // @ts-expect-error skip
    else if ((value.constructor && value.constructor.name === 'VueRouter') || value.currentRoute) {
      // TODO: Vue Router
      return {
        rawType: 'string',
        recursive: false,
        value: '"[object Router]"',
      }
    }
    // @ts-expect-error skip
    else if (typeof value.render === 'function') {
      // TODO: Detailed Vue Component
      return {
        rawType: 'object',
        recursive: false,
        // @ts-expect-error skip
        value: formatWithExtraType(value.__name, 'Component') ?? 'Vue Component',
      }
    }
    else if (isPlainObject(value)) {
      return {
        rawType: 'object',
        rawDisplay: '{...}',
        recursive: true,
        value,
      }
    }

    else {
      return {
        rawType: 'string',
        recursive: false,
        value: `"${toRawType(value)}"`,
      }
    }
  }
  else {
    return {
      rawType: 'literal',
      recursive: false,
      value,
    }
  }
}
