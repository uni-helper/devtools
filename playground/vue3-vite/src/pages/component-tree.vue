<script setup lang="ts">
import PageIntro from '@/components/PageIntro.vue'
import ListRow from '@/components/tree/ListRow.vue'
import PanelA from '@/components/tree/PanelA.vue'
import PanelB from '@/components/tree/PanelB.vue'
import PanelC from '@/components/tree/PanelC.vue'
import RecursiveNode, { type TreeNodeData } from '@/components/tree/RecursiveNode.vue'
import TreeGroup from '@/components/tree/TreeGroup.vue'

const groupVisible = ref(true)
const rowIds = ref([1, 2, 3])
let nextRowId = 4
const activePanel = ref<'a' | 'b' | 'c'>('a')

/** 回到页面初始状态（e2e 每轮结束靠它回到基线组件数） */
function reset() {
  groupVisible.value = true
  rowIds.value = [1, 2, 3]
  nextRowId = 4
  activePanel.value = 'a'
}

const sampleTree: TreeNodeData = {
  label: 'src',
  children: [
    { label: 'pages', children: [{ label: 'index.vue' }, { label: 'detail.vue' }] },
    { label: 'components', children: [{ label: 'PageIntro.vue' }] },
  ],
}

// 操作按钮用 v-for + 字符串 key 渲染：mp 编译后事件处理器名带上 key（如 e3_hide-group），
// e2e 脚本（.claude/skills/scripts/e2e.js）按这个名字触发，改 key 要同步改脚本
const actions = [
  { key: 'hide-group', label: '隐藏 TreeGroup', run: () => (groupVisible.value = false) },
  { key: 'show-group', label: '显示 TreeGroup', run: () => (groupVisible.value = true) },
  { key: 'add-row', label: '列表 +1 行', run: () => rowIds.value.push(nextRowId++) },
  { key: 'remove-row', label: '列表 -1 行', run: () => rowIds.value.pop() },
  { key: 'panel-a', label: '切到 A', run: () => (activePanel.value = 'a') },
  { key: 'panel-b', label: '切到 B', run: () => (activePanel.value = 'b') },
  { key: 'panel-c', label: '切到 C', run: () => (activePanel.value = 'c') },
  { key: 'reset', label: '复位', run: reset },
]
</script>

<template>
  <view class="page">
    <PageIntro
      title="组件树增删"
      :checks="[
        'Components：点下方按钮后，组件树在 1 秒内自动变化，不用刷新面板',
        '隐藏 / 显示 TreeGroup：整棵子树（含 3 个 GroupLeaf）一起消失 / 出现',
        '列表增删：ListRow 数量跟着变',
        '切换 A/B/C：只剩当前那个 Panel；切回的是新实例，clicks 从 0 开始',
        'RecursiveNode 逐层嵌套，层级与左侧缩进一致',
      ]"
    />

    <view class="card">
      <view v-for="action in actions" :key="action.key" class="btn" @click="action.run">
        {{ action.label }}
      </view>
    </view>

    <view class="card">
      <view class="card-title">
        整组显示 / 隐藏
      </view>
      <TreeGroup v-if="groupVisible" />
      <view v-else class="kv">
        （已隐藏）
      </view>
    </view>

    <view class="card">
      <view class="card-title">
        列表增删（{{ rowIds.length }} 行）
      </view>
      <ListRow v-for="id in rowIds" :key="id" :row-id="id" />
    </view>

    <view class="card">
      <view class="card-title">
        A / B / C 切换（当前 {{ activePanel.toUpperCase() }}）
      </view>
      <PanelA v-if="activePanel === 'a'" />
      <PanelB v-else-if="activePanel === 'b'" />
      <PanelC v-else />
    </view>

    <view class="card">
      <view class="card-title">
        递归组件
      </view>
      <RecursiveNode :node="sampleTree" :depth="0" />
    </view>
  </view>
</template>
