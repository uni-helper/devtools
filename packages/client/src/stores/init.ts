import type { InitState, VersionState } from '@uni-helper/devtools-types'

export const useInitState = createGlobalState(
  () => {
    const initState = ref<InitState>({})
    const versionState = ref<VersionState>()
    const currentPage = ref('')
    const loading = ref(false)
    function init() {
      trpc.onVersion.subscribe(undefined, {
        onData: (data) => {
          versionState.value = data
        },
      })
      trpc.onCurrentPage.subscribe(undefined, {
        onData: (data) => {
          currentPage.value = data
          console.log('currentPage', data)
        },
      })
      trpc.onComponentTree.subscribe(undefined, {
        onData: (data) => {
          console.log(data)
          initState.value.components = data
        },
      })
    }

    return {
      init,
      loading,
      initState,
      currentPage,
      versionState,
    }
  },
)
