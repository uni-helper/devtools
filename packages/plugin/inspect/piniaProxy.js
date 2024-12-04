/**
 * @param {import("pinia").PiniaPluginContext} ctx
 */
export default ({ store }) => {
  console.log('store created', store.$id)
  console.log('initState', store.$state)
  store.$subscribe((mutation, state) => {
    console.log(mutation.storeId)
    console.log('store changed', state)
  }, { detached: true })
}
