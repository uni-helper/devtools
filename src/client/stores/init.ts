import type { InitState } from '~/types'

export const useInitState = createGlobalState(
  () => {
    const initState = ref<InitState[]>()
    function init() {
      const params = new URLSearchParams(window.location.search)
      const data = params.get('data')!
      initState.value = JSON.parse(decodeURIComponent(data))
    }

    return {
      initState,
      init,
    }
  },
)
