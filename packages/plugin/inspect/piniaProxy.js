import { stringify } from '@vue/devtools-kit'
import { trpc } from './trpc'

/**
 *
 * @param {string} id
 * @param {*} state
 */
function sendPiniaState(id, state) {
  const data = {
    key: id,
    value: state,
  }

  trpc.sendPiniaState.subscribe(
    // @ts-ignore
    {
      [id]: stringify(data),
    },
    {
      onComplete: () => {},
    },
  )
}

/**
 * @param {import("pinia").PiniaPluginContext} ctx
 */
export default ({ store, options }) => {
  sendPiniaState(store.$id, store.$state)
  console.log('Pinia store', store)
  console.log('Pinia options', options)
  store.$subscribe((mutation, state) => {
    sendPiniaState(mutation.storeId, state)
  })
}
