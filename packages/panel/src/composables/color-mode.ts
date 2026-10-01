import { onMounted, onUnmounted, ref } from 'vue'

type ColorScheme = 'dark' | 'light'

// uni-devtools：与 devframe hub 外壳共用主题键（packages/hub-ui 的
// state/color-mode.ts）。iframe 场景靠读取宿主 .dark/.light class 跟随（零改动）；
// standalone 直连与外壳经此键 + storage 事件互相驱动。外壳的 'auto' 表示跟随
// 系统，读侧视为未设置，落入下方 host → system 解析链。
const COLOR_SCHEME_STORAGE_KEY = 'devframes-color-scheme'

export function useDevtoolsColorMode() {
  const dark = ref(false)
  let colorSchemeMedia: MediaQueryList | undefined
  let hostThemeObserver: MutationObserver | undefined

  function applyColorScheme(scheme: ColorScheme, options: { persist?: boolean } = {}) {
    dark.value = scheme === 'dark'
    document.documentElement.classList.toggle('dark', dark.value)
    document.documentElement.classList.toggle('light', !dark.value)

    if (options.persist) writeStoredColorScheme(scheme)
  }

  function setDarkMode(value: boolean) {
    applyColorScheme(value ? 'dark' : 'light', { persist: true })
  }

  function syncColorMode() {
    applyColorScheme(resolveColorScheme())
  }

  function onSystemColorSchemeChange() {
    if (readStoredColorScheme() || resolveHostColorScheme()) return
    syncColorMode()
  }

  function onStorageChange(event: StorageEvent) {
    if (event.key !== COLOR_SCHEME_STORAGE_KEY) return
    syncColorMode()
  }

  onMounted(() => {
    syncColorMode()

    colorSchemeMedia = window.matchMedia('(prefers-color-scheme: dark)')
    colorSchemeMedia.addEventListener('change', onSystemColorSchemeChange)
    window.addEventListener('storage', onStorageChange)

    hostThemeObserver = observeHostTheme(syncColorMode)
  })

  onUnmounted(() => {
    colorSchemeMedia?.removeEventListener('change', onSystemColorSchemeChange)
    window.removeEventListener('storage', onStorageChange)
    hostThemeObserver?.disconnect()
  })

  return {
    dark,
    setDarkMode,
    syncColorMode,
  }
}

function resolveColorScheme(): ColorScheme {
  return readStoredColorScheme() ?? resolveHostColorScheme() ?? resolveSystemColorScheme()
}

function readStoredColorScheme(): ColorScheme | undefined {
  try {
    const value = window.localStorage.getItem(COLOR_SCHEME_STORAGE_KEY)
    // 'auto'（外壳的默认值）= 未显式选择，交由 host / system 决定。
    return isColorScheme(value) ? value : undefined
  } catch {
    return undefined
  }
}

function writeStoredColorScheme(scheme: ColorScheme) {
  try {
    window.localStorage.setItem(COLOR_SCHEME_STORAGE_KEY, scheme)
  } catch {}
}

function resolveHostColorScheme(): ColorScheme | undefined {
  const hostDocument = getHostDocument()
  if (!hostDocument) return undefined

  for (const element of [hostDocument.documentElement, hostDocument.body]) {
    if (!element) continue

    if (element.classList.contains('dark')) return 'dark'
    if (element.classList.contains('light')) return 'light'

    const theme = element.getAttribute('data-theme')
    if (isColorScheme(theme)) return theme
  }

  return undefined
}

function resolveSystemColorScheme(): ColorScheme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function observeHostTheme(onChange: () => void): MutationObserver | undefined {
  const hostDocument = getHostDocument()
  if (!hostDocument || typeof MutationObserver === 'undefined') return undefined

  const observer = new MutationObserver(onChange)
  for (const element of [hostDocument.documentElement, hostDocument.body]) {
    if (!element) continue

    observer.observe(element, {
      attributes: true,
      attributeFilter: ['class', 'data-theme'],
    })
  }

  return observer
}

function getHostDocument(): Document | undefined {
  if (window.parent === window) return undefined

  try {
    return window.parent.document
  } catch {
    return undefined
  }
}

function isColorScheme(value: unknown): value is ColorScheme {
  return value === 'dark' || value === 'light'
}
