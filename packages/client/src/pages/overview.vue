<script setup lang="ts">
import { version } from './../../package.json'
import UniIcon from '/icon/uni_icon.png'

const { initState } = useInitState()

const pages = await trpc.getPages.query()
const modules = await trpc.getComponent.query()

const vueModules = modules?.filter(module => module.id.endsWith('vue')).length
</script>

<template>
  <PanelGrids h-screen w-full flex of-auto>
    <div flex="~ col gap2 justify-center" ma h-full w-full px10>
      <!-- Banner -->
      <div flex="~ col" mt-10 items-center>
        <DevToolsLogo mb2 h-18 />
        <div mb6 mt--1 text-center text-sm flex="~ gap-1">
          <span op40>
            Uni DevTools
          </span>
          <code op40>v{{ version }}</code>
        </div>
      </div>

      <!-- Main Grid -->
      <div flex="~ gap2 wrap">
        <div p4 theme-card-green flex="~ col auto">
          <img :src="UniIcon" h-7.5 w-7.5>
          <code>v{{ initState?.uniCompileVersion }}</code>
        </div>
        <div p4 theme-card-green flex="~ col auto">
          <div i-logos-vue text-3xl />
          <code>v{{ initState?.vueVersion }}</code>
        </div>
        <RouterLink flex="~ col auto" to="/pages" replace min-w-40 p4 theme-card-lime>
          <div i-carbon-tree-view-alt text-3xl />
          <div>{{ pages.length }} pages</div>
        </RouterLink>
        <RouterLink v-if="vueModules" flex="~ col auto" to="/components" replace min-w-40 p4 theme-card-lime>
          <div i-carbon-assembly-cluster text-3xl />
          <div>{{ vueModules }} components</div>
        </RouterLink>
      </div>

      <div flex="~ gap-6 wrap" mt-5 items-center justify-center>
        <a href="https://github.com/flippedround/uni-devtools" target="_blank" flex="~ gap1" items-center op50 hover="op100 text-blue" transition>
          <div i-carbon-star />
          Star on GitHub
        </a>
        <a href="https://github.com/flippedround/uni-devtools/discussions/111" target="_blank" flex="~ gap1" items-center op50 hover="op100 text-yellow" transition>
          <div i-carbon-data-enrichment />
          Ideas & Suggestions
        </a>
        <a href="https://github.com/flippedround/uni-devtools/discussions/112" target="_blank" flex="~ gap1" items-center op50 hover="op100 text-lime" transition>
          <div i-carbon-plan />
          Project Roadmap
        </a>
        <a href="https://github.com/flippedround/uni-devtools/issues" target="_blank" flex="~ gap1" items-center op50 hover="op100 text-rose" transition>
          <div i-carbon-debug />
          Bug Reports
        </a>
        <RouterLink to="/settings" flex="~ gap1" replace inline-block items-center op50 hover:op80>
          <div i-carbon-settings />
          Settings
        </RouterLink>
      </div>
    </div>
  </PanelGrids>
</template>
