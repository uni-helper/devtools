<script setup>
import { onLoad } from '@dcloudio/uni-app'
import { computed, ref } from 'vue'

const from = ref('')
onLoad((params) => {
  console.log('params', params)
  from.value = params.from
})
const src = computed(() => `http://localhost:\${port}?from=${from.value}`)
</script>

<template>
  <web-view :src="src" />
</template>
