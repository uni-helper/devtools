import type { VersionState } from '@uni-helper/devtools-types'

export const useInitState = createGlobalState(
  () => {
    const versionState = ref<VersionState>()
    const currentPage = ref('')
    function init() {
      trpc.onVersion.subscribe(undefined, {
        onData: (data) => {
          versionState.value = data
        },
      })
      trpc.onCurrentPage.subscribe(undefined, {
        onData: (data) => {
          currentPage.value = data
        },
      })
    }

    return {
      init,
      currentPage,
      versionState,
    }
  },
)
