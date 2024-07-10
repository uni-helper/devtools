import type { Maybe } from '@trpc/server'
import type { AbortControllerEsque } from './types'

export function getAbortController(
  customAbortControllerImpl: Maybe<AbortControllerEsque>,
): AbortControllerEsque | null {
  if (customAbortControllerImpl) {
    return customAbortControllerImpl
  }

  if (typeof window !== 'undefined' && window.AbortController) {
    return window.AbortController
  }
  if (typeof globalThis !== 'undefined' && globalThis.AbortController) {
    return globalThis.AbortController
  }

  return null
}
