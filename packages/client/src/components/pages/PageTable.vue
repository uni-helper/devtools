<script setup lang="ts">
import type { PageMeta } from '@uni-helper/devtools-types'
import { VueBadge } from '@vue/devtools-ui'

defineProps<{
  routeInput: string
}>()

const pages = await trpc.getPages.query()

function metaToString(meta: PageMeta, num: number = 0) {
  const metaStr = JSON.stringify(meta, null, num)
  return metaStr === '{}' ? '-' : metaStr
}
</script>

<template>
  <div>
    <table w-full>
      <thead border="b base" px-3>
        <tr>
          <th text-left />
          <th text-left>
            Page Path
          </th>
          <th text-left>
            Page Meta
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="page of pages" :key="page.path" class="group" h-7 border="b dashed transparent hover:base">
          <td w-20 pr-1>
            <div flex items-center justify-end>
              <VueBadge
                v-if="page.tabBar"
                bg-green-400:10 text-green-400
              >
                tabBar
              </VueBadge>
            </div>
          </td>
          <td text-sm>
            <div flex="inline gap3" items-center>
              <PagePathItem
                :page="page"
                :class="page.path.includes(routeInput) && routeInput !== '' ? 'text-green-400' : ''"
              />
              <div op0 group-hover:op100 flex="~ gap1">
                <button
                  text-sm op40 hover="op100 text-primary-400"
                  title="Open in editor"
                  @click="openInEditor(page.filePath)"
                >
                  <div i-carbon-script-reference />
                </button>
              </div>
            </div>
          </td>
          <td w-80 ws-nowrap pr-1 text-left text-sm font-mono op50 hover="text-primary op100">
            <span inline-block w-80 cursor-pointer overflow-hidden text-ellipsis :title="metaToString(page.meta, 2)" @click="() => $emit('selectMeta', page.meta)">{{ metaToString(page.meta) }}</span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
