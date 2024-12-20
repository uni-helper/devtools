<script setup lang="ts">
import {test as test12} from './test'
import {ref} from 'vue'
const a = 1
const r = ref(1)
function name(params) {
  console.log(params)
}
const aa = () => {
  r.value++
}
const obj = {
  a: 1
}
const test = 1

</script>
<template>
  <div>
    <span @click="name">{{ a }}</span>
    <button @click="aa">{{ r }}</button>
    <span>{{ obj }}</span>
  </div>
</template>
