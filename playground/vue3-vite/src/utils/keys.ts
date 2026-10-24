import type { InjectionKey, Ref } from 'vue'

// provide-inject 场景页用到的注入键
export interface InjectedUser {
  name: string
  level: number
}

export const THEME_KEY: InjectionKey<Ref<'light' | 'dark'>> = Symbol('theme')
export const USER_KEY: InjectionKey<InjectedUser> = Symbol('user')
