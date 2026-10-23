import { defineStore } from 'pinia'

// Setup 写法的 store：ref 是 state，computed 是 getter
export const useProfileStore = defineStore('profile', () => {
  const name = ref('Ada')
  const level = ref(1)
  const title = computed(() => `${name.value} · Lv.${level.value}`)

  function levelUp() {
    level.value++
  }

  return { name, level, title, levelUp }
})
