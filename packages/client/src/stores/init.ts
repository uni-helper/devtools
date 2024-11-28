import type { VersionState } from '@uni-helper/devtools-types'

export const useInitState = createGlobalState(
  () => {
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
    }

    return {
      init,
      loading,
      currentPage,
      versionState,
    }
  },
)
