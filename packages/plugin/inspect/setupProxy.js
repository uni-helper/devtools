import { watch } from 'vue'
import { stringify } from '@vue/devtools-kit'

/**
 *
 * @param {Record<string, *>} bindings
 * @param {string} fileName
 */
export function setupProxy(bindings, fileName) {
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
            fileName,
            key,
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
