<script setup lang="ts">
import { version } from './../../package.json'
import UniIcon from '/icon/uni_icon.png'

const { versionState } = useInitState()

const pages = await trpc.getPages.query()
const modules = await trpc.getModules.query()
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
        <div cursor-pointer p4 theme-card-green flex="~ col auto" @click="openInBrowser('https://uniapp.dcloud.net.cn/')">
          <img :src="UniIcon" h-7.5 w-7.5>
          <code>v{{ versionState?.uniVersion }}</code>
        </div>
        <div cursor-pointer p4 theme-card-green flex="~ col auto" @click="openInBrowser('https://cn.vuejs.org/')">
          <div i-logos-vue text-3xl />
          <code>v{{ versionState?.vueVersion }}</code>
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
        <div flex="~ gap1" cursor-pointer items-center op50 hover="op100 text-blue" transition @click="openInBrowser('https://github.com/uni-helper/devtools')">
          <div i-carbon-star />
          Star on GitHub
        </div>
        <div flex="~ gap1" cursor-pointer items-center op50 hover="op100 text-yellow" transition @click="openInBrowser('https://github.com/uni-helper/devtools/discussions/2')">
          <div i-carbon-data-enrichment />
          Ideas & Suggestions
        </div>
        <div flex="~ gap1" cursor-pointer items-center op50 hover="op100 text-lime" transition @click="openInBrowser('https://github.com/uni-helper/devtools/discussions/3')">
          <div i-carbon-plan />
          Project Roadmap
        </div>
        <div flex="~ gap1" cursor-pointer items-center op50 hover="op100 text-rose" transition @click="openInBrowser('https://github.com/uni-helper/devtools/issues')">
          <div i-carbon-debug />
          Bug Reports
        </div>
        <!-- <RouterLink to="/settings" flex="~ gap1" replace inline-block items-center op50 hover:op80>
          <div i-carbon-settings />
          Settings
        </RouterLink> -->
      </div>
    </div>
  </PanelGrids>
</template>
