import { decompressURLQuery } from '@uni-helper/devtools-shared'
import type { InitState } from '~/types'

export const useInitState = createGlobalState(
  () => {
    const initState = ref<InitState>()
    function init() {
      const params = new URLSearchParams(window.location.search)
      const data = params.get('data')
      if (!data)
        return
      initState.value = decompressURLQuery(data)
      console.log('initState', initState.value)
    }

    return {
      initState,
      init,
    }
  },
)
