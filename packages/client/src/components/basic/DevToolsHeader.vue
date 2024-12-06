<script setup lang="ts">
import { defineProps } from 'vue'

defineProps<{
  githubRepoLink?: string
  docLink: string
}>()
</script>

<template>
  <div border="b base" class="flex items-center justify-between px3">
    <div>
      <slot>
        <i class="i-ep:back cursor-pointer op70 text-base hover:op100" />
      </slot>
    </div>
    <div>
      <a class="pr2" :href="docLink" target="_blank" title="View Documentation">
        <i class="i-clarity:document-line cursor-pointer op70 text-base hover:op100" />
      </a>
      <a v-if="githubRepoLink" :href="githubRepoLink" target="_blank" title="Star on GitHub">
        <i class="i-mdi:github cursor-pointer op70 text-base hover:op100" />
      </a>
    </div>
  </div>
</template>
