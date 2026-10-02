<script setup lang="ts">
import { Pane, Splitpanes } from 'splitpanes'
import { computed, onUnmounted, ref, shallowRef, watch } from 'vue'
import { getUniNetworkApi } from '../adapter/uni-devtools-rpc'
import { useDevtoolsClient } from '../composables/devtools-client'
import type { NetworkRecord, UniNetworkApi } from '../types/network'

const { connected } = useDevtoolsClient()
const devtoolsClient = useDevtoolsClient() as any
const networkApi = computed<UniNetworkApi | undefined>(() => devtoolsClient.client?.uniNetwork ?? getUniNetworkApi())

const records = shallowRef<NetworkRecord[]>([])
const selectedRecord = ref<NetworkRecord | undefined>()
const filterText = ref('')

let unsub: (() => void) | undefined
watch(
  networkApi,
  (api) => {
    unsub?.()
    unsub = undefined
    if (api) {
      unsub = api.subscribe((updated) => {
        records.value = updated
      })
    }
    else {
      records.value = []
    }
  },
  { immediate: true },
)

onUnmounted(() => {
  unsub?.()
})

watch(records, (newRecords) => {
  if (selectedRecord.value && !newRecords.some(r => r.id === selectedRecord.value!.id)) {
    selectedRecord.value = undefined
  }
})

const filteredRecords = computed(() => {
  const list = [...records.value].reverse()
  const query = filterText.value.trim().toLowerCase()
  if (!query)
    return list
  return list.filter((r) => {
    const matchUrl = r.url?.toLowerCase().includes(query)
    const matchMethod = r.method?.toLowerCase().includes(query)
    const matchStatus = String(r.status).includes(query)
    const matchType = r.type?.toLowerCase().includes(query)
    return matchUrl || matchMethod || matchStatus || matchType
  })
})

async function clearRecords() {
  if (networkApi.value) {
    await networkApi.value.clear()
    selectedRecord.value = undefined
  }
}

function formatUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl)
    return parsed.pathname + parsed.search || parsed.hostname
  }
  catch {
    return rawUrl
  }
}

function formatDuration(ms?: number): string {
  if (ms == null || isNaN(ms))
    return '-'
  if (ms < 1000)
    return `${Math.round(ms)} ms`
  return `${(ms / 1000).toFixed(2)} s`
}

function formatBytes(bytes?: number): string {
  if (bytes == null || isNaN(bytes) || bytes === 0)
    return '-'
  if (bytes < 1024)
    return `${bytes} B`
  if (bytes < 1024 * 1024)
    return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatTime(ts: number): string {
  if (!ts)
    return '-'
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function getStatusClass(status: number): string {
  if (status >= 200 && status < 300)
    return 'bg-green-400/10 text-green-500'
  if (status >= 300 && status < 400)
    return 'bg-cyan-400/10 text-cyan-500'
  if (status >= 400)
    return 'bg-red-400/10 text-red-500'
  return 'bg-gray-400/10 text-gray-500'
}

function getTypeBadgeClass(type: string): string {
  if (type === 'upload')
    return 'bg-purple-400/10 text-purple-400'
  if (type === 'download')
    return 'bg-blue-400/10 text-blue-400'
  return 'bg-gray-400/10 text-gray-400'
}

function formatBody(body: unknown): string {
  if (body == null)
    return ''
  if (typeof body === 'object') {
    try {
      return JSON.stringify(body, null, 2)
    }
    catch {
      return String(body)
    }
  }
  return String(body)
}
</script>

<template>
  <div class="h-full grid grid-rows-[auto_1fr] overflow-hidden">
    <!-- Toolbar -->
    <div class="border-b border-base px-3 py-2 flex items-center justify-between gap-3">
      <div class="flex items-center gap-2">
        <span class="i-carbon-api text-base op70" />
        <span class="font-500 text-sm">Network</span>
        <span class="rounded bg-gray-400/10 px-1.5 py-0.5 font-mono text-xs text-gray-500">
          {{ filteredRecords.length }}{{ filterText ? ` / ${records.length}` : '' }}
        </span>
      </div>

      <div class="flex flex-1 items-center justify-end gap-2">
        <!-- Filter input -->
        <div class="relative max-w-xs w-full flex items-center">
          <span class="i-carbon-search pointer-events-none absolute left-2 text-xs op40" />
          <input
            v-model="filterText"
            type="text"
            placeholder="Filter requests..."
            class="w-full rounded border border-base bg-transparent py-1 pl-6 pr-6 text-xs outline-none placeholder-op40 focus:border-primary"
          >
          <button
            v-if="filterText"
            type="button"
            class="i-carbon-close absolute right-2 cursor-pointer border-0 bg-transparent p-0 text-xs op40 hover:op100"
            @click="filterText = ''"
          />
        </div>

        <!-- Clear button -->
        <button
          type="button"
          class="cursor-pointer flex items-center gap-1 rounded border border-base bg-transparent px-2.5 py-1 text-xs hover:bg-active"
          :disabled="records.length === 0"
          :class="records.length === 0 ? 'op40 cursor-not-allowed' : 'hover:text-red-500'"
          title="Clear network records"
          @click="clearRecords"
        >
          <span class="i-carbon-clean text-xs" />
          <span>Clear</span>
        </button>
      </div>
    </div>

    <!-- Main Content: Splitpanes -->
    <Splitpanes class="overflow-hidden">
      <!-- Left pane: Records List -->
      <Pane :size="selectedRecord ? 60 : 100" class="overflow-auto!">
        <!-- Empty state: not connected -->
        <div v-if="!connected && records.length === 0" class="h-full flex flex-col items-center justify-center gap-2 p-12 text-center op50">
          <span class="i-carbon-warning text-3xl" />
          <span class="text-sm">Waiting for host runtime...</span>
        </div>

        <!-- Empty state: no records -->
        <div v-else-if="records.length === 0" class="h-full flex flex-col items-center justify-center gap-2 p-12 text-center op50">
          <span class="i-carbon-api text-3xl" />
          <span class="text-sm">No requests captured yet</span>
          <span class="text-xs">Mini-program network requests (request / upload / download) will appear here</span>
        </div>

        <!-- Empty state: filter no match -->
        <div v-else-if="filteredRecords.length === 0" class="h-full flex flex-col items-center justify-center gap-2 p-12 text-center op50">
          <span class="i-carbon-search text-2xl" />
          <span class="text-sm">No matching requests for "{{ filterText }}"</span>
        </div>

        <!-- Records table -->
        <table v-else class="w-full border-collapse text-left">
          <thead class="sticky top-0 z-1 border-b border-base bg-base/90 text-xs backdrop-blur">
            <tr>
              <th class="w-16 px-2 py-1.5 font-500 op60">Status</th>
              <th class="w-16 px-2 py-1.5 font-500 op60">Method</th>
              <th class="px-2 py-1.5 font-500 op60">URL</th>
              <th class="w-20 px-2 py-1.5 font-500 op60">Type</th>
              <th class="w-20 px-2 py-1.5 text-right font-500 op60">Duration</th>
              <th class="w-20 px-2 py-1.5 text-right font-500 op60">Size</th>
              <th class="w-20 px-2 py-1.5 text-right font-500 op60">Time</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="item in filteredRecords"
              :key="item.id"
              class="cursor-pointer border-b border-base/40 text-xs transition select-none"
              :class="selectedRecord?.id === item.id ? 'bg-active' : 'hover:bg-active/50'"
              @click="selectedRecord = item"
            >
              <td class="w-16 whitespace-nowrap px-2 py-1.5">
                <span class="rounded px-1.5 py-0.5 font-mono font-bold text-11px" :class="getStatusClass(item.status)">
                  {{ item.status || 'FAIL' }}
                </span>
              </td>
              <td class="w-16 whitespace-nowrap px-2 py-1.5 font-mono font-bold text-11px">
                {{ item.method }}
              </td>
              <td class="max-w-xs truncate px-2 py-1.5 font-mono text-11px" :title="item.url">
                {{ formatUrl(item.url) }}
              </td>
              <td class="w-20 whitespace-nowrap px-2 py-1.5">
                <span class="rounded px-1.5 py-0.5 font-mono text-10px uppercase tracking-wider" :class="getTypeBadgeClass(item.type)">
                  {{ item.type }}
                </span>
              </td>
              <td class="w-20 whitespace-nowrap px-2 py-1.5 text-right font-mono text-11px op70">
                {{ formatDuration(item.duration) }}
              </td>
              <td class="w-20 whitespace-nowrap px-2 py-1.5 text-right font-mono text-11px op70">
                {{ formatBytes(item.responseSize) }}
              </td>
              <td class="w-20 whitespace-nowrap px-2 py-1.5 text-right font-mono text-11px op50">
                {{ formatTime(item.startTime) }}
              </td>
            </tr>
          </tbody>
        </table>
      </Pane>

      <!-- Right pane: Record Detail -->
      <Pane v-if="selectedRecord" size="40" class="overflow-auto!">
        <div class="p-3 flex flex-col gap-4 text-xs">
          <!-- Detail header -->
          <div class="flex items-center justify-between border-b border-base pb-2">
            <span class="font-600 text-sm">Request Details</span>
            <button
              type="button"
              class="i-carbon-close cursor-pointer border-0 bg-transparent p-1 color-muted hover:color-base"
              title="Close detail"
              @click="selectedRecord = undefined"
            />
          </div>

          <!-- General overview -->
          <div class="rounded border border-base bg-active/20 p-2.5 flex flex-col gap-1.5 font-mono text-11px">
            <div class="flex items-start gap-2">
              <span class="w-16 shrink-0 op50">URL:</span>
              <span class="break-all font-mono select-all">{{ selectedRecord.url }}</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="w-16 shrink-0 op50">Method:</span>
              <span class="font-bold">{{ selectedRecord.method }}</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="w-16 shrink-0 op50">Status:</span>
              <span class="rounded px-1.5 py-0.25 font-bold" :class="getStatusClass(selectedRecord.status)">
                {{ selectedRecord.status || 'FAIL' }}
              </span>
            </div>
            <div class="flex items-center gap-2">
              <span class="w-16 shrink-0 op50">Type:</span>
              <span class="uppercase">{{ selectedRecord.type }}</span>
            </div>
            <div v-if="selectedRecord.page" class="flex items-center gap-2">
              <span class="w-16 shrink-0 op50">Page:</span>
              <span>{{ selectedRecord.page }}</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="w-16 shrink-0 op50">Duration:</span>
              <span>{{ formatDuration(selectedRecord.duration) }}</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="w-16 shrink-0 op50">Size:</span>
              <span>{{ formatBytes(selectedRecord.responseSize) }}</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="w-16 shrink-0 op50">Time:</span>
              <span>{{ new Date(selectedRecord.startTime).toISOString() }}</span>
            </div>
          </div>

          <!-- Error message if present -->
          <div v-if="selectedRecord.error" class="rounded border border-red-500/30 bg-red-500/10 p-2.5 text-red-500">
            <div class="mb-1 font-bold">Error</div>
            <div class="break-all font-mono text-11px">{{ selectedRecord.error }}</div>
          </div>

          <!-- Request Headers -->
          <div v-if="selectedRecord.requestHeaders && Object.keys(selectedRecord.requestHeaders).length > 0">
            <div class="mb-1.5 font-600 op80">Request Headers</div>
            <div class="rounded border border-base bg-active/20 p-2 font-mono text-11px">
              <div
                v-for="(val, key) in selectedRecord.requestHeaders"
                :key="key"
                class="flex items-start gap-2 py-0.5"
              >
                <span class="shrink-0 font-bold op70">{{ key }}:</span>
                <span class="break-all select-all">{{ val }}</span>
              </div>
            </div>
          </div>

          <!-- Request Body -->
          <div v-if="selectedRecord.requestBody != null">
            <div class="mb-1.5 flex items-center justify-between">
              <span class="font-600 op80">Request Body</span>
              <span v-if="selectedRecord.requestBodyTruncated" class="rounded bg-orange-400/10 px-1.5 py-0.25 text-10px text-orange-400">
                已截断
              </span>
            </div>
            <pre class="m-0 max-h-60 overflow-auto rounded border border-base bg-active/30 p-2.5 font-mono text-11px leading-relaxed"><code>{{ formatBody(selectedRecord.requestBody) }}</code></pre>
          </div>

          <!-- Response Headers -->
          <div v-if="selectedRecord.responseHeaders && Object.keys(selectedRecord.responseHeaders).length > 0">
            <div class="mb-1.5 font-600 op80">Response Headers</div>
            <div class="rounded border border-base bg-active/20 p-2 font-mono text-11px">
              <div
                v-for="(val, key) in selectedRecord.responseHeaders"
                :key="key"
                class="flex items-start gap-2 py-0.5"
              >
                <span class="shrink-0 font-bold op70">{{ key }}:</span>
                <span class="break-all select-all">{{ val }}</span>
              </div>
            </div>
          </div>

          <!-- Response Body -->
          <div v-if="selectedRecord.responseBody != null">
            <div class="mb-1.5 flex items-center justify-between">
              <span class="font-600 op80">Response Body</span>
              <span v-if="selectedRecord.responseBodyTruncated" class="rounded bg-orange-400/10 px-1.5 py-0.25 text-10px text-orange-400">
                已截断
              </span>
            </div>
            <pre class="m-0 max-h-80 overflow-auto rounded border border-base bg-active/30 p-2.5 font-mono text-11px leading-relaxed"><code>{{ formatBody(selectedRecord.responseBody) }}</code></pre>
          </div>
        </div>
      </Pane>
    </Splitpanes>
  </div>
</template>
