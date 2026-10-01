<script setup lang="ts">
import ActionButton from '@antfu/design/components/Action/ActionButton.vue'
import LayoutSplitPane from '@antfu/design/components/Layout/LayoutSplitPane.vue'
import { Pane } from 'splitpanes'
import { computed, onMounted, onUnmounted } from 'vue'
import {
  connectionBody,
  connectionDetail,
  connectionGlyph,
  connectionPanel,
  connectionState,
  connectionTitle,
} from '@design/design'
import { connect, connectionError, connectionStatus } from './df/client'
import { bindTreePush, refreshTree } from './state/inspector'
import ComponentTree from './components/ComponentTree.vue'
import InspectorToolbar from './components/InspectorToolbar.vue'
import PanelRail from './components/PanelRail.vue'
import StatePanel from './components/StatePanel.vue'

// 连接不可用时用设计基座的统一全屏状态文案（connecting/disconnected/
// unauthorized/error 各有固定形态），面板自己不再发明加载与错误页。
const stateCopy = computed(() => connectionState(connectionStatus.value))

let stopTreeSync: (() => void) | null = null

onMounted(async () => {
  // mock 模式下 connect() 只标记状态、不发起真实连接（见 df/client.ts）。
  await connect().catch(() => {})
  if (connectionStatus.value === 'connected') {
    await refreshTree()
    // 探针推送 → node sharedState → 面板实时跟随（P6「小程序 → Web」方向）。
    bindTreePush()
      .then((off) => { stopTreeSync = off })
      .catch(() => {})
  }
})

onUnmounted(() => {
  stopTreeSync?.()
  stopTreeSync = null
})

function reload(): void {
  window.location.reload()
}
</script>

<template>
  <!-- 布局对齐 Vue Devtools 的「里子」结构：左侧竖排图标栏 + 右侧检查器视图，
       每个视图自带头部工具行；面板不再有顶部横条。 -->
  <div class="h-full flex overflow-hidden">
    <PanelRail />

    <div class="flex-1 min-w-0 flex flex-col overflow-hidden">
      <div v-if="stateCopy" :class="connectionPanel('flex-1')">
        <div :class="connectionGlyph(stateCopy.spin)">
          <span :class="stateCopy.icon" />
        </div>
        <div :class="connectionTitle()">
          {{ stateCopy.title }}
        </div>
        <div :class="connectionBody()">
          {{ stateCopy.body }}
        </div>
        <div v-if="connectionError" :class="connectionDetail()">
          {{ connectionError.message }}
        </div>
        <ActionButton v-if="stateCopy.reloadable" variant="action" @click="reload">
          重新加载
        </ActionButton>
      </div>

      <template v-else>
        <LayoutSplitPane storage-key="uni-devtools-panel-split" class="flex-1 min-h-0">
          <!-- 每栏各带自己的工具行（对齐 Vue Devtools）：左栏 = 组件过滤 + 树 -->
          <Pane min-size="20" :size="40">
            <div class="h-full flex flex-col overflow-hidden">
              <InspectorToolbar />
              <ComponentTree class="flex-1 min-h-0" />
            </div>
          </Pane>
          <!-- 右栏 = <Name> + Filter State + 状态编辑 -->
          <Pane min-size="20" :size="60">
            <StatePanel />
          </Pane>
        </LayoutSplitPane>
      </template>
    </div>
  </div>
</template>
