<script setup lang="ts">
defineProps<{
  data: {
    icon: string
    label: string
    path: string
    id: string
  }[]
}>()

defineEmits(['change'])
const modelValue = defineModel<string>()
</script>

<template>
  <ul class="flex gap3">
    <li
      v-for="(item, index) in data"
      :key="index"
      class="h-10 flex cursor-pointer items-center justify-center border-b-[2px] border-solid text-size-sm leading-none hover:op100"
      :class="modelValue === item.id ? 'op-100 font-medium text-primary-400 border-primary-400' : 'border-transparent op-70'"
      @click="modelValue = item.id"
    >
      {{ item.label }}
    </li>
  </ul>
</template>
