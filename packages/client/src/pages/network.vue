<script setup lang="ts">
import { Pane, Splitpanes } from 'splitpanes'
import { computed, nextTick, onUnmounted, ref, shallowRef, watch } from 'vue'
import { getUniNetworkApi } from '@uni-helper/devtools-adapter'
import { useDevtoolsClient } from '../composables/devtools-client'
import type { NetworkRecord } from '@uni-helper/devtools-shared'
import type { UniNetworkApi } from '@uni-helper/devtools-adapter'

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
  stopPendingTick()
})

watch(records, (newRecords) => {
  if (selectedRecord.value && !newRecords.some(r => r.id === selectedRecord.value!.id)) {
    selectedRecord.value = undefined
  }
})

// 请求按发起顺序展示（越早越靠上，与 Chrome DevTools Network 一致）；探针
// 侧 id 单调递增，id 升序即发起顺序
const filteredRecords = computed(() => {
  const query = filterText.value.trim().toLowerCase()
  if (!query)
    return records.value
  return records.value.filter((r) => {
    const matchUrl = r.url?.toLowerCase().includes(query)
    const matchMethod = r.method?.toLowerCase().includes(query)
    const matchStatus = String(r.status).includes(query)
    const matchType = r.type?.toLowerCase().includes(query)
    return matchUrl || matchMethod || matchStatus || matchType
  })
})

// ---- Waterfall 瀑布列 ----

/** 终态结算（complete 回调）必写 duration；缺失即请求仍在途，与已结算的网络层失败（FAIL）区分 */
function isPendingRecord(record: NetworkRecord): boolean {
  return record.duration == null
}

const nowTick = ref(Date.now())
let pendingTickTimer: ReturnType<typeof setInterval> | undefined

function stopPendingTick(): void {
  if (pendingTickTimer) {
    clearInterval(pendingTickTimer)
    pendingTickTimer = undefined
  }
}

// 在途请求的瀑布条以当前时刻为右端点：仅在存在 pending 记录时开 1s 心跳，
// 让未结算的条随时间生长，全结算后停表
watch(
  () => filteredRecords.value.some(isPendingRecord),
  (hasPending) => {
    if (hasPending && !pendingTickTimer) {
      pendingTickTimer = setInterval(() => {
        nowTick.value = Date.now()
      }, 1000)
    }
    else if (!hasPending) {
      stopPendingTick()
    }
  },
  { immediate: true },
)

const waterfallLayout = computed(() => {
  const list = filteredRecords.value
  if (list.length === 0)
    return undefined
  let start = Number.POSITIVE_INFINITY
  let end = 0
  for (const r of list) {
    start = Math.min(start, r.startTime)
    end = Math.max(end, r.duration != null ? r.startTime + r.duration : nowTick.value)
  }
  return { start, span: Math.max(end - start, 1) }
})

function getWaterfallStyle(record: NetworkRecord): { left: string, width: string } {
  const layout = waterfallLayout.value
  if (!layout)
    return { left: '0%', width: '0%' }
  const endTs = record.duration != null ? record.startTime + record.duration : nowTick.value
  const left = Math.min(Math.max(((record.startTime - layout.start) / layout.span) * 100, 0), 99.2)
  const width = Math.min(Math.max(((endTs - record.startTime) / layout.span) * 100, 0.8), 100 - left)
  return { left: `${left}%`, width: `${width}%` }
}

function getWaterfallBarClass(record: NetworkRecord): string {
  if (isPendingRecord(record))
    return 'bg-gray-400/60 animate-pulse'
  if (record.status >= 200 && record.status < 300)
    return 'bg-green-500/80'
  if (record.status >= 300 && record.status < 400)
    return 'bg-cyan-500/80'
  return 'bg-red-500/80'
}

// ---- 列表跟随滚动：新记录追加在列表尾部，钉在底部时自动跟随 ----

const listPaneRef = ref<any>()
let followNewest = true

function onListScroll(): void {
  const el = listPaneRef.value?.$el as HTMLElement | undefined
  if (!el)
    return
  followNewest = el.scrollHeight - el.scrollTop - el.clientHeight < 48
}

watch(records, () => {
  if (!followNewest)
    return
  nextTick(() => {
    const el = listPaneRef.value?.$el as HTMLElement | undefined
    if (el)
      el.scrollTop = el.scrollHeight
  })
})

async function clearRecords() {
  if (networkApi.value) {
    await networkApi.value.clear()
    selectedRecord.value = undefined
    followNewest = true
  }
}

function onSelectRecord(record: NetworkRecord): void {
  selectedRecord.value = record
  // 用户在翻历史记录：暂停跟随滚动，避免阅读中被新请求顶走
  followNewest = false
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

interface StatusView {
  text: string
  class: string
}

function getStatusView(record: NetworkRecord): StatusView {
  if (isPendingRecord(record))
    return { text: '(pending)', class: 'bg-gray-400/10 text-gray-400 animate-pulse' }
  if (record.status >= 200 && record.status < 300)
    return { text: String(record.status), class: 'bg-green-400/10 text-green-500' }
  if (record.status >= 300 && record.status < 400)
    return { text: String(record.status), class: 'bg-cyan-400/10 text-cyan-500' }
  // status=0 且已结算：网络层失败（fail 回调），与在途 pending 区分
  return { text: record.status > 0 ? String(record.status) : 'FAIL', class: 'bg-red-400/10 text-red-500' }
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
      <Pane ref="listPaneRef" :size="selectedRecord ? 60 : 100" class="overflow-auto!" @scroll="onListScroll">
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
              <th class="w-44 min-w-36 px-2 py-1.5 font-500 op60">
                <span class="flex items-center justify-between gap-2">
                  <span>Waterfall</span>
                  <span v-if="waterfallLayout" class="font-mono text-10px font-400 op50">{{ formatDuration(waterfallLayout.span) }}</span>
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="item in filteredRecords"
              :key="item.id"
              class="cursor-pointer border-b border-base/40 text-xs transition select-none"
              :class="selectedRecord?.id === item.id ? 'bg-active' : 'hover:bg-active/50'"
              @click="onSelectRecord(item)"
            >
              <td class="w-16 whitespace-nowrap px-2 py-1.5">
                <span class="rounded px-1.5 py-0.5 font-mono font-bold text-11px" :class="getStatusView(item).class">
                  {{ getStatusView(item).text }}
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
              <td class="w-44 min-w-36 px-2 py-1.5">
                <div class="relative h-3 w-full overflow-hidden rounded-sm bg-gray-400/5">
                  <div
                    class="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full"
                    :class="getWaterfallBarClass(item)"
                    :style="getWaterfallStyle(item)"
                    :title="isPendingRecord(item) ? 'In flight...' : formatDuration(item.duration)"
                  />
                </div>
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
              <span class="rounded px-1.5 py-0.25 font-bold" :class="getStatusView(selectedRecord).class">
                {{ getStatusView(selectedRecord).text }}
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
              <span>{{ formatTime(selectedRecord.startTime) }}</span>
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
