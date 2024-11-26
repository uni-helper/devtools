<script setup lang="ts">
import { VueBadge, VueInput } from '@vue/devtools-ui'

const { currentPage: _currentPage } = useInitState()

// const params = new URLSearchParams(window.location.search)
const currentPage = toRaw(_currentPage.value)
const routeInput = ref(currentPage)
const pages = await trpc.getPages.query()
const pageCount = pages.length

function handlePush(page: typeof pages[number]) {
  // @ts-expect-error 有uni方法
  uni[page.tabBar ? 'switchTab' : 'redirectTo']({
    url: `/${page.path}`,
  })
}
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
      <SectionBlock
        icon="i-carbon-tree-view-alt"
        text="All Pages"
        :description="`${pageCount} Pages registered in your application`"
        :padding="false"
      >
        <div cursor-pointer px4 space-y-2>
          <div
            v-for="page in pages"
            :key="page.path"
            @click="handlePush(page)"
          >
            <VueBadge
              v-if="page.tabBar"
              mr2 bg-green-400:10 text-green-400
            >
              tabBar
            </VueBadge>
            <span
              flex="inline gap3"
              items-center
              :class="page.path.includes(routeInput) ? 'text-green-400' : ''"
            >
              {{ `/${page.path}` }}
            </span>
          </div>
        </div>
      </SectionBlock>
    </div>
  </PanelGrids>
</template>
