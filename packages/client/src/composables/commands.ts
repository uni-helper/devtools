import type { ComputedRef } from 'vue'
import type { DevtoolsTab } from '../types/tab'
import Fuse from 'fuse.js'
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { createVueDocumentationCommands } from '../constants/documentation'
import { useDevtoolsClient } from './devtools-client'

export interface DevtoolsCommand {
  id: string
  title: string
  description?: string
  group: 'Navigation' | 'Actions' | 'Documentation'
  icon: string
  keywords?: string[]
  action():
    | Promise<readonly DevtoolsCommand[] | void>
    | readonly DevtoolsCommand[]
    | void
}

interface DevtoolsCommandsOptions {
  tabs: ComputedRef<DevtoolsTab[]>
}

export function useDevtoolsCommands(
  options: DevtoolsCommandsOptions,
): ComputedRef<DevtoolsCommand[]> {
  const router = useRouter()
  const { inspectComponentInPage } = useDevtoolsClient()

  return computed(() => [
    // uni-devtools：不支持的 tab 已在 tab catalog 层隐藏，天然进不了命令面板。
    ...options.tabs.value.flatMap<DevtoolsCommand>((tab) => {
      if (!tab.path) return []
      return [
        {
          id: `navigate:${tab.id}`,
          title: `Open ${tab.title}`,
          description: tab.description,
          group: 'Navigation',
          icon: tab.icon,
          keywords: ['tab', tab.id],
          action: async () => {
            await router.push(tab.path!)
          },
        },
      ]
    }),
    {
      id: 'components:inspect',
      title: 'Inspect Component',
      description: 'Select a component from the page',
      group: 'Actions',
      icon: 'i-carbon-select-window',
      keywords: ['locator', 'picker'],
      action: async () => {
        await inspectComponentInPage()
      },
    },
    {
      id: 'documentation:vue',
      title: 'Vue Documentation',
      group: 'Documentation',
      icon: 'i-logos-vue',
      keywords: ['docs', 'guide', 'api'],
      action: createVueDocumentationCommands,
    },
  ])
}

export function filterDevtoolsCommands(
  commands: readonly DevtoolsCommand[],
  query: string,
): DevtoolsCommand[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (!terms.length) return [...commands]

  const fuse = new Fuse(commands, {
    keys: [
      { name: 'title', weight: 0.55 },
      { name: 'keywords', weight: 0.2 },
      { name: 'description', weight: 0.15 },
      { name: 'group', weight: 0.1 },
    ],
    threshold: 0.38,
    ignoreLocation: true,
  })
  return fuse.search(terms.join(' ')).map(({ item }) => item)
}
