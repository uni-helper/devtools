import { getCurrentInstance, watch } from 'vue'
import { stringify } from '@vue/devtools-kit'

/**
 *
 * @param {Record<string, *>} bindings
 */
export function setupProxy(bindings) {
  /**
   * @type {import("@trpc/client").CreateTRPCProxyClient<import("./../src/index").AppRouter>}
   */
  // @ts-ignore
  const trpc = uni.$trpc
  for (const key in bindings) {
    watch(
      () => bindings[key],
      (newValue) => {
        trpc.sendComponentData.subscribe(
          {
            key,
            // @ts-ignore
            id: getCurrentInstance().uid,
            value: stringify([newValue]),
          },
          {
            onComplete: () => {},
            onError: error => console.error(error),
          },
        )
      },
      { deep: true, immediate: true },
    )
  }
}

/**
 *
 * @param {Record<string, *>} newValue
 * @param {number} id
 */
export function positionWatchBindings(newValue, id) {
  /**
   * @type {import("@trpc/client").CreateTRPCProxyClient<import("./../src/index").AppRouter>}
   */
  // @ts-ignore
  const trpc = uni.$trpc
  for (const key in newValue) {
    trpc.sendComponentData.subscribe(
      {
        key,
        id,
        value: stringify([newValue[key]]),
      },
      {
        onComplete: () => {},
        onError: error => console.error(error),
      },
    )
  }
}
