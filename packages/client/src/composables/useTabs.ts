// @unocss-include

import type { CustomTab } from '@vue/devtools-kit'
import type { ModuleBuiltinTab } from '~/types'

export interface TabItem {
  icon: string
  name: string
  order: number
  path: string
  title: string
}

export type CategoryTabs = [string, TabItem[]]
export function useTabs() {
  const builtinTab = ref<CategoryTabs[]>([
    [
      'app',
      [
        {
          icon: 'i-carbon-information',
          name: 'overview',
          order: -100,
          path: '/overview',
          title: 'Overview',
        },
        {
          icon: 'i-carbon-assembly-cluster',
          name: 'components',
          order: -100,
          path: '/components',
          title: 'Components',
        },
        {
          icon: 'i-carbon-tree-view-alt',
          name: 'pages',
          order: -100,
          path: '/pages',
          title: 'Pages',
        },
        {
          icon: 'i-carbon-image-copy',
          name: 'assets',
          order: -100,
          path: '/assets',
          title: 'Assets',
        },
      ],
    ],
    [
      'modules',
      [
        {
          icon: 'i-logos-pinia',
          name: 'pinia',
          order: -100,
          path: '/pinia',
          title: 'Pinia',
        },
      ],
    ],
    [
      'advanced',
      [
        {
          icon: 'i-lucide:swatch-book',
          name: 'documents',
          order: -100,
          path: '/documents',
          title: 'Documents',
        },
        // {
        //   icon: 'i-tabler:terminal',
        //   name: 'console',
        //   order: 100,
        //   path: '/console',
        //   title: 'Console',
        // },
        {
          icon: 'i-carbon-network-4',
          name: 'graph',
          order: -100,
          path: '/graph',
          title: 'Graph',
        },
        {
          icon: 'i-carbon-ibm-watson-discovery',
          name: 'inspect',
          order: -100,
          path: '/inspect',
          title: 'Inspect',
        },
      ],
    ],
  ])

  const CUSTOM_TAB_VIEW = 'custom-tab-view'

  trpc.onTab.subscribe(undefined, {
    onData: (data) => {
      const category = data.category || 'app'
      builtinTab.value.forEach(([c, tabs]) => {
        if (c === category) {
          if (!tabs.find(t => t.name === data.name)) {
            tabs.push({
              ...data,
              path: `/${CUSTOM_TAB_VIEW}/${data.name}`,
            } as unknown as TabItem)
          }
        }
      })
    },
  })

  const flattenedTabs = computed(() => {
    return builtinTab.value.reduce((prev, [_, tabs]) => {
      tabs.forEach((tab) => {
        prev.push(tab)
      })
      return prev
    }, [] as Array<ModuleBuiltinTab | CustomTab>)
  })

  return { builtinTab, flattenedTabs }
}
