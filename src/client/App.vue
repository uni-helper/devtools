<script setup>
import { ref } from 'vue'
import { StyleProvider, Themes } from '@varlet/ui'

StyleProvider(Themes.md3Dark)
const active = ref(0)
</script>

<template>
  <var-tabs
    v-model:active="active"
    elevation
    color="var(--color-primary)"
    active-color="var(--color-on-primary)"
    inactive-color="var(--color-on-info)"
  >
    <var-tab>选项1</var-tab>
    <var-tab>选项2</var-tab>
    <var-tab>选项3</var-tab>
    <var-tab>选项4</var-tab>
    <var-tab>选项5</var-tab>
    <var-tab>选项6</var-tab>
    <var-tab>选项7</var-tab>
    <var-tab>选项8</var-tab>
  </var-tabs>
  <router-view />
</template>
