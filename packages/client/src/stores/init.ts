import type { InitState } from '@uni-helper/devtools-types'

export const useInitState = createGlobalState(
  () => {
    const initState = ref<InitState>()
    const loading = ref(false)
    function init() {
      trpc.onVersion.subscribe(undefined, {
        onData: (data) => {
          initState.value = data
        },
      })
    }

    return {
      init,
      loading,
      initState,
    }
  },
)
