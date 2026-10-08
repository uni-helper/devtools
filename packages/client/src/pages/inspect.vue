<script setup lang="ts">
import { computed, ref } from 'vue'

const showBanner = ref(true)

const iframeSrc = computed(() => {
  if (typeof window === 'undefined') return '/__uni-devtools/inspect/'
  const pathname = window.location.pathname
  const normalized = pathname.endsWith('/')
    ? pathname
    : pathname.split('/').pop()?.includes('.')
      ? pathname.slice(0, pathname.lastIndexOf('/') + 1)
      : `${pathname}/`
  return `${normalized}inspect/`
})

const iframeRef = ref<HTMLIFrameElement>()

function reloadIframe() {
  if (iframeRef.value) {
    iframeRef.value.src = iframeSrc.value
  }
}

function openInNewTab() {
  if (typeof window !== 'undefined') {
    window.open(iframeSrc.value, '_blank')
  }
}
</script>

<template>
  <div class="h-full min-h-0 flex flex-col overflow-hidden bg-base">
    <div
      v-if="showBanner"
      class="shrink-0 border-b border-base bg-subtle px-3 py-1.5 text-xs text-muted flex items-center justify-between gap-2"
    >
      <div class="flex items-center gap-1.5 truncate">
        <i class="i-carbon-ibm-watson-discovery shrink-0 text-primary" />
        <span class="truncate"
          >Vite 转换管线检查器 · 每次构建后刷新 · standalone 直连模式生效</span
        >
      </div>
      <div class="flex shrink-0 items-center gap-2">
        <button
          type="button"
          class="hover:text-base cursor-pointer transition-colors"
          title="刷新检查器"
          @click="reloadIframe"
        >
          <i class="i-carbon-renew" />
        </button>
        <button
          type="button"
          class="hover:text-base cursor-pointer transition-colors"
          title="在新标签页中打开"
          @click="openInNewTab"
        >
          <i class="i-carbon-launch" />
        </button>
        <button
          type="button"
          class="hover:text-base cursor-pointer transition-colors"
          title="关闭提示"
          @click="showBanner = false"
        >
          <i class="i-carbon-close" />
        </button>
      </div>
    </div>
    <div class="min-h-0 flex-1">
      <iframe
        ref="iframeRef"
        :src="iframeSrc"
        class="h-full w-full border-none block"
        allow="clipboard-read; clipboard-write"
      />
    </div>
  </div>
</template>
