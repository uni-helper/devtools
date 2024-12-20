import type { SFCDescriptor } from 'vue/compiler-sfc'
import { parse as VueParser, compileScript } from 'vue/compiler-sfc'
import { parse as AcornParser } from 'acorn'

export function parseSFC(code: string): SFCDescriptor {
  try {
    return (
      VueParser(code, {
        pad: 'space',
      }).descriptor
      // for @vue/compiler-sfc ^2.7
      || (VueParser as any)({
        source: code,
      })
    )
  }
  catch {
    throw new Error(
      '[@uni-helper/devtools] Vue3\'s "@vue/compiler-sfc" is required.',
    )
  }
}

export function parseScript(descriptor: SFCDescriptor, id: string) {
  return compileScript(
    descriptor,
    { id },
  )
}

export function parseJS(code: string) {
  return AcornParser(code, {
    ecmaVersion: 'latest',
    sourceType: 'module',
  })
}
