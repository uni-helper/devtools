import { usePreferredDark, useStorage } from '@vueuse/core'
import { computed, watchEffect } from 'vue'

export type ColorSchemePreference = 'auto' | 'light' | 'dark'

/**
 * 与 Hub 外壳共用同一个 localStorage 键（`packages/hub-ui` 的
 * `state/color-mode.ts` 用的是同一个）：外壳里切换主题时写这个键，同源
 * iframe 通过 `storage` 事件收到通知，一次切换同时驱动外壳与所有面板。
 * standalone 直连时则只有本页自己读写它，行为退化为普通偏好存储。
 */
const COLOR_SCHEME_STORAGE_KEY = 'devframes-color-scheme'

const preference = useStorage<ColorSchemePreference>(COLOR_SCHEME_STORAGE_KEY, 'auto')
const preferredDark = usePreferredDark()

/** `auto` 跟随系统 `prefers-color-scheme`。 */
export const isDark = computed(() =>
  preference.value === 'auto'
    ? preferredDark.value
    : preference.value === 'dark',
)

/**
 * 主题契约（`docs/HUB_UI_SPECIFICATION.md` §6）：根容器实时绑定 `.dark` /
 * `.light`，并显式声明 `color-scheme`，保证原生输入框与滚动条在双色模式下
 * 都获得原生平滑渲染。面板是独立文档（iframe），绑在 `<html>` 上。
 */
watchEffect(() => {
  const el = document.documentElement
  el.classList.toggle('dark', isDark.value)
  el.classList.toggle('light', !isDark.value)
  el.style.colorScheme = isDark.value ? 'dark' : 'light'
})
