<script setup lang="ts">
// 各种类型的 props，面板 Props 区逐个核对序列化结果
export interface ShowcaseUser {
  id: number
  name: string
  address: { city: string, geo: { lat: number, lng: number } }
}

defineProps<{
  title: string
  count: number
  disabled: boolean
  remark: string | null
  user: ShowcaseUser
  tags: string[]
  format: (value: number) => string
  createdAt: Date
  pattern: RegExp
  meta: Map<string, string>
  flags: Set<string>
  token: symbol
}>()
</script>

<template>
  <view class="kv">
    {{ title }} · count = {{ count }} · disabled = {{ disabled }} · user = {{ user.name }}@{{ user.address.city }}
  </view>
</template>
