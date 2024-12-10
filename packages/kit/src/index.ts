import type { CustomTab } from '@vue/devtools-kit'
import { isUrlString } from '@vue/devtools-shared'
import { createTrpc } from './trpc'

function resolveIcon(icon?: string) {
  if (!icon)
    return
  if (icon.startsWith('baseline-')) {
    return `custom-ic-${icon}`
  }
  // devtools internal custom tab icons are starts with `i-` prefix, render as it is set in unocss safelist
  // or if it's a url
  if (icon.startsWith('i-') || isUrlString(icon))
    return icon
  // for custom-tab, we use `custom-ic-` prefix
  return `custom-ic-baseline-${icon}`
}

export function addCustomTab(tab: CustomTab) {
  console.log('addCustomTab', tab)
  const trpc = createTrpc()!
  // @ts-expect-error type not important
  trpc.sendTab.subscribe({
    ...tab,
    icon: resolveIcon(tab.icon),
  }, {
    onComplete: () => {},
  })
}
