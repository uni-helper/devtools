import type { InitState, VersionState } from '@uni-helper/devtools-types'

export const useInitState = createGlobalState(
  () => {
    const initState = ref<InitState>({})
    const versionState = ref<VersionState>()
    const loading = ref(false)
    function init() {
      trpc.onVersion.subscribe(undefined, {
        onData: (data) => {
          versionState.value = data
        },
      })
      trpc.onCurrentPage.subscribe(undefined, {
        onData: (data) => {
          initState.value.currentPage = data
        },
      })
      trpc.onComponentTree.subscribe(undefined, {
        onData: (data) => {
          initState.value.components = data
        },
      })
    }

    return {
      init,
      loading,
      initState,
      versionState,
    }
  },
)
