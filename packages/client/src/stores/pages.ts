import type { ModuleInfo } from '~/types'

export const usePagesState = createGlobalState(
  () => {
    const pagesState = ref<ModuleInfo[]>()
    const pageCount = computed(() => pagesState.value?.length || 0)

    async function getPages() {
      if (!pagesState.value?.length) {
        const response = await fetch('/api/getPages')
        pagesState.value = await response.json()
      }
      return pagesState
    }

    return {
      pagesState,
      getPages,
      pageCount,
    }
  },
)
