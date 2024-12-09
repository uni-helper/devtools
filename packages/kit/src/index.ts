import type { CustomTab } from '@vue/devtools-kit'
import { createTrpc } from './trpc'

export function addCustomTab(tab: CustomTab) {
  console.log('addCustomTab', tab)
  const trpc = createTrpc()!
  trpc.sendTab.subscribe(
    {
      aa: '111',
    },
    {
      onComplete: () => {},
    },
  )
}
