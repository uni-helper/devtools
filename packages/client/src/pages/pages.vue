<script setup lang="ts">
import type { PageMeta } from '@uni-helper/devtools-types'
import { VueInput } from '@vue/devtools-ui'
import { Pane, Splitpanes } from 'splitpanes'

const { currentPage: _currentPage } = useInitState()

const currentPage = toRaw(_currentPage)
const routeInput = ref(currentPage)
const pages = await trpc.getPages.query()
const pageCount = pages.length
const selectedMeta = ref<PageMeta>()
</script>

<template>
  <PanelGrids block h-screen of-auto>
    <div h-full of-auto>
      <div border="b base" flex="~ col gap1" px4 py3 navbar-glass>
        <div>
          <span op50>Current route</span>
        </div>
        <VueInput
          v-model="routeInput"
          left-icon="i-carbon-direction-right-01 scale-y--100"
          class="text-green!"
        />
      </div>
      <Splitpanes class="of-hidden">
        <Pane size="70" class="of-auto!">
          <SectionBlock
            icon="i-carbon-tree-view-alt"
            text="All Pages"
            :description="`${pageCount} Pages registered in your application`"
            :padding="false"
          >
            <PageTable
              :route-input="routeInput"
              @select-meta="(meta: PageMeta) => selectedMeta = meta"
            />
          </SectionBlock>
        </Pane>
        <Pane v-if="!!selectedMeta" size="30" class="of-auto!">
          <RouteMetaDetail :meta="selectedMeta" @close="selectedMeta = undefined" />
        </Pane>
      </Splitpanes>
    </div>
  </PanelGrids>
</template>
