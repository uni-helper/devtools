import type { InjectionKey, Ref } from 'vue'

export interface UserProfile {
  id: number
  name: string
  role: string
  skills: string[]
  level: number
  settings: {
    theme: 'light' | 'dark'
    notifications: boolean
  }
}

export const THEME_KEY: InjectionKey<Ref<'light' | 'dark'>> = Symbol('ThemeKey')
export const USER_INFO_KEY: InjectionKey<UserProfile> = Symbol('UserInfoKey')
export const SYMBOL_KEY: InjectionKey<string> = Symbol('DevtoolsSymbolKey')
export const APP_CONFIG_KEY: InjectionKey<{ appName: string; version: string }> = Symbol('AppConfigKey')
