import type { ModuleInfo } from '~/types'

export const useOverviewState = createGlobalState(
  () => {
    const modules = ref<ModuleInfo[]>()
    const vueVersion = ref('')

    const vueModules = computed(() => {
      return modules.value?.filter(module => module.id.endsWith('vue')).length
    })

    async function getModules() {
      if (!modules.value?.length) {
        const response = await fetch('/api/component')
        modules.value = await response.json()
      }
      return modules
    }

    async function getDependencies() {
      const response = await fetch('/api/dependencies')
      const { packageJson } = await response.json()
      return packageJson
    }

    async function getVueVersion() {
      if (!vueVersion.value)
        vueVersion.value = (await getDependencies()).dependencies.vue

      return vueVersion
    }

    return {
      vueModules,
      getModules,
      vueVersion,
      getVueVersion,
    }
  },
)
