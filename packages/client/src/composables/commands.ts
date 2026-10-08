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
    // uni-devtools：被禁用的 tab（探针协议未就绪）不进命令面板——否则
    // Cmd+K 仍可跳转到置灰页面，打穿禁用防护（CR P1-4）。
    ...options.tabs.value
      .filter((tab) => !tab.disabled)
      .flatMap<DevtoolsCommand>((tab) => {
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
