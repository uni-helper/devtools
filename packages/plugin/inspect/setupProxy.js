import { watch } from 'vue'
import { stringify } from '@vue/devtools-kit'

/**
 *
 * @param {{key: string, value: *}[]} bindings
 * @param {string} fileName
 */
export function setupProxy(bindings, fileName) {
  /**
   * @type {import("@trpc/client").CreateTRPCProxyClient<import("./../src/index").AppRouter>}
   */
  // @ts-ignore
  const trpc = uni.$trpc
  bindings.forEach((binding) => {
    watch(
      () => binding.value,
      (newValue) => {
        console.log('watch', binding, newValue)
        console.log(trpc)
        trpc.sendComponentData.subscribe(
          {
            fileName,
            key: binding.key,
            value: stringify(newValue),
          },
          { onComplete: () => console.log('Data sent successfully'), onError: error => console.error('Error sending data', error) },
        )
      },
      { deep: true, immediate: true },
    )
  })
}
