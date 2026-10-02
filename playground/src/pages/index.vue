<script setup lang="ts">
import { computed, reactive, ref } from 'vue'

// 导入旧版测试组件（保持兼容）
import AppLogos from '@/components/AppLogos.vue'
import InputEntry from '@/components/InputEntry.vue'
import TestComp from '@/components/TestComp.vue'
import OptionsScript from '@/components/OptionsScript.vue'
import CompositionScript from '@/components/CompositionScript.vue'
import HiCounter from '@/components/HiCounter.vue'

// 导入全新完善的 DevTools 场景测试组件库
import PropsBasicDemo, { type UserItem } from '@/components/demos/PropsBasicDemo.vue'
import PropsAdvancedDemo from '@/components/demos/PropsAdvancedDemo.vue'
import ModelTwoWayDemo from '@/components/demos/ModelTwoWayDemo.vue'
import EventsEmitsDemo, { type SubmitPayload } from '@/components/demos/EventsEmitsDemo.vue'
import SlotsScopedDemo from '@/components/demos/SlotsScopedDemo.vue'
import ProvideInjectParent from '@/components/demos/ProvideInjectParent.vue'
import ExposeRefsDemo from '@/components/demos/ExposeRefsDemo.vue'
import ReactivityFullDemo from '@/components/demos/ReactivityFullDemo.vue'
import TreeDemo from '@/components/demos/TreeDemo.vue'
import DynamicKeepAliveDemo from '@/components/demos/DynamicKeepAliveDemo.vue'
import AttrsFallthroughDemo from '@/components/demos/AttrsFallthroughDemo.vue'
import OptionsApiFullDemo from '@/components/demos/OptionsApiFullDemo.vue'
import NetworkDemoCard from '@/components/demos/NetworkDemoCard.vue'

// 当前导航分类 Tab
type CategoryTab =
  | 'ALL'
  | 'PROPS'
  | 'MODELS_EVENTS'
  | 'SLOTS_REFS'
  | 'PROVIDE_INJECT'
  | 'REACTIVITY'
  | 'TREE_KEEPALIVE'
  | 'OPTIONS_API'
  | 'LEGACY'

const activeTab = ref<CategoryTab>('ALL')

const tabs: Array<{ id: CategoryTab; label: string; icon: string }> = [
  { id: 'ALL', label: '全部组件 (All)', icon: 'i-carbon-grid' },
  { id: 'PROPS', label: 'Props 传值全景', icon: 'i-carbon-box' },
  { id: 'MODELS_EVENTS', label: 'v-model & 事件', icon: 'i-carbon-arrows-horizontal' },
  { id: 'SLOTS_REFS', label: '插槽与 Refs', icon: 'i-carbon-template' },
  { id: 'PROVIDE_INJECT', label: 'Provide / Inject', icon: 'i-carbon-tree-view' },
  { id: 'REACTIVITY', label: '响应式与计算图', icon: 'i-carbon-chart-bubble' },
  { id: 'TREE_KEEPALIVE', label: '递归与 KeepAlive', icon: 'i-carbon-flow' },
  { id: 'OPTIONS_API', label: 'Options API 对比', icon: 'i-carbon-script' },
  { id: 'LEGACY', label: '旧版沙盒', icon: 'i-carbon-cube' },
]

// ==========================================
// 1. Props 测试父级响应式状态
// ==========================================
const parentPropTitle = ref('Vue DevTools 探针测试')
const parentPropCount = ref(88)
const parentPropDisabled = ref(false)
const parentPropRemark = ref<string | null>('来自父级的非空备注')

const parentPropUser = reactive<UserItem>({
  id: 1001,
  name: 'Antigravity Master',
  role: 'Core Architect',
  address: {
    province: '广东省',
    city: '深圳市',
    coordinates: { lat: 22.5428, lng: 114.0595 },
  },
  scores: [98, 95, 100],
})

const parentPropTags = ref(['Vue3', 'UniApp', 'DevTools', 'Vite', 'UnoCSS'])

const parentPropCallback = (msg: string) => {
  logEvent('Props Callback', { receivedFromChild: msg, timestamp: Date.now() })
  return `[Parent Handled: ${msg}]`
}

const parentPropDate = ref(new Date())
const parentPropPattern = ref(/^uni-helper-.*$/)
const parentPropMap = ref(new Map([['cluster', 'production'], ['node', 'hk-01']]))
const parentPropSet = ref(new Set(['read', 'write', 'execute']))
const parentPropSymbol = ref(Symbol('parent-token-symbol'))

// 动态透传的扩展 props (通过 v-bind="dynamicExtraProps")
const dynamicExtraProps = reactive({
  extraBadge: 'VIP_PASSED_PROP',
  'data-flag': 'v-bind-success',
})

// 随机变更父级 Props（测试 DevTools 中 Props 实时刷新）
function randomizeParentProps() {
  parentPropCount.value = Math.floor(Math.random() * 500)
  parentPropDisabled.value = !parentPropDisabled.value
  parentPropUser.name = `Developer_${Math.floor(Math.random() * 1000)}`
  parentPropUser.address.city = ['杭州市', '北京市', '上海市', '广州市', '成都市'][Math.floor(Math.random() * 5)]
  parentPropUser.scores.push(Math.floor(Math.random() * 100))
  parentPropDate.value = new Date()
  logEvent('Parent Props Mutated', {
    count: parentPropCount.value,
    user: parentPropUser.name,
    city: parentPropUser.address.city,
  })
}

// ==========================================
// 2. v-model / defineModel 测试父级响应式状态
// ==========================================
const parentModelText = ref('DevTools 初始双向文本')
const parentModelCount = ref(100)
const parentModelTitle = ref('devtools title')
const parentModelActive = ref(true)

// ==========================================
// 3. 事件与监听器日志系统
// ==========================================
interface EventLogItem {
  id: number
  time: string
  name: string
  payload: any
}

const eventLogs = ref<EventLogItem[]>([])

function logEvent(name: string, payload: any) {
  eventLogs.value.unshift({
    id: Date.now() + Math.random(),
    time: new Date().toLocaleTimeString(),
    name,
    payload,
  })
  if (eventLogs.value.length > 20) {
    eventLogs.value.pop()
  }
}

function handleCustomSubmit(payload: SubmitPayload) {
  logEvent('customSubmit', payload)
}

function handleCountChange(nextCount: number) {
  logEvent('countChange', { nextCount })
}

function handleReset() {
  logEvent('reset', { resetAt: new Date().toLocaleTimeString() })
}

// 注意：该监听器在 EventsEmitsDemo 中未声明，DevTools 将提示 "Not declared: will leak into component attrs"
function handleUndeclaredEvent(payload: any) {
  logEvent('undeclared-event (未声明事件)', payload)
}

function handleOptionsAction(payload: any) {
  logEvent('customOptionsAction', payload)
}

// ==========================================
// 4. Slots 动态插槽测试
// ==========================================
const dynamicSlotName = ref('customDynamicSlot')
const dynamicSlotCounter = ref(1)

function toggleDynamicSlot() {
  dynamicSlotName.value = dynamicSlotName.value === 'customDynamicSlot' ? 'alternativeSlot' : 'customDynamicSlot'
  dynamicSlotCounter.value++
}

// ==========================================
// 5. Template Refs 与 defineExpose 测试
// ==========================================
const exposeChildRef = ref<InstanceType<typeof ExposeRefsDemo>>()
const parentInputRef = ref<HTMLInputElement>()
const exposeCallResult = ref('')

function callChildIncrement() {
  if (exposeChildRef.value) {
    exposeChildRef.value.increment()
    exposeCallResult.value = `调用成功，当前 Child Count: ${exposeChildRef.value.count}`
    logEvent('Child Ref Call', { count: exposeChildRef.value.count })
  }
}

function callChildReset() {
  if (exposeChildRef.value) {
    exposeChildRef.value.resetCount()
    exposeCallResult.value = `Child 已重置: ${exposeChildRef.value.count}`
    logEvent('Child Ref Reset', { count: exposeChildRef.value.count })
  }
}

function readChildSnapshot() {
  if (exposeChildRef.value) {
    const snapshot = exposeChildRef.value.getSnapshot()
    exposeCallResult.value = JSON.stringify(snapshot)
    logEvent('Child Snapshot Read', snapshot)
  }
}
</script>

<template>
  <view min-h-screen bg="gray-100 dark:gray-900" p-4 pb-12 font-sans text-gray-800 dark:text-gray-100>
    <!-- 顶部 Banner 与 DevTools 提示 -->
    <view mb-4 text-center>
      <AppLogos />
      <view text-xs text-gray-500 mt-2 font-mono flex items-center justify-center gap-2>
        <text class="i-carbon-tools" text-teal-600 />
        <text>Uni-Helper DevTools 组件应用场景综合测试控制台</text>
      </view>
    </view>

    <!-- 分类导航 Tab 栏 -->
    <view flex flex-wrap gap-1.5 mb-4 p-2 bg="white dark:gray-800" rounded-xl shadow-sm border="~ solid gray-200 dark:gray-700">
      <view
        v-for="t in tabs"
        :key="t.id"
        flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs cursor-pointer font-medium transition-all
        :class="activeTab === t.id ? 'bg-teal-600 text-white shadow-sm' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'"
        @click="activeTab = t.id"
      >
        <text :class="t.icon" text-sm />
        <text>{{ t.label }}</text>
      </view>
    </view>

    <!-- 全局快捷控制栏 -->
    <view flex items-center justify-between p-3 mb-4 bg="white dark:gray-800" rounded-xl shadow-sm border="~ solid gray-200 dark:gray-700" text-xs>
      <view flex items-center gap-2>
        <text font-bold text-teal-700 dark:text-teal-300>快捷动作:</text>
        <button size="mini" bg="teal-600 text-white" px-2.5 py-1 rounded text-xs @click="randomizeParentProps">
          🎲 随机变更父级 Props
        </button>
        <button size="mini" bg="purple-600 text-white" px-2.5 py-1 rounded text-xs @click="toggleDynamicSlot">
          🔀 切换动态插槽名 ({{ dynamicSlotName }})
        </button>
      </view>
      <button size="mini" bg="gray-200 dark:gray-700 text-gray-700 dark:text-gray-200" px-2 py-0.5 rounded text-xs @click="eventLogs = []">
        清空事件日志
      </button>
    </view>

    <!-- ======================================================== -->
    <!-- 场景 1: Props 传值全景 (基础、复杂对象、运行时校验、v-bind) -->
    <!-- ======================================================== -->
    <view v-if="activeTab === 'ALL' || activeTab === 'PROPS'">
      <view text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5>
        <text class="i-carbon-box" text-teal-600 />
        <text>一、Props 传值全类型与高级语法场景</text>
      </view>

      <!-- 1.1 PropsBasicDemo -->
      <PropsBasicDemo
        :title="parentPropTitle"
        :count="parentPropCount"
        :disabled="parentPropDisabled"
        :remark="parentPropRemark"
        :user="parentPropUser"
        :tags="parentPropTags"
        :callback="parentPropCallback"
        :created-at="parentPropDate"
        :pattern="parentPropPattern"
        :meta-map="parentPropMap"
        :unique-set="parentPropSet"
        :symbol-id="parentPropSymbol"
        kebab-prop-name="kebab-passed-attribute"
        @callback-triggered="(res) => logEvent('PropsCallbackTriggered', res)"
      />

      <!-- 1.2 PropsAdvancedDemo (运行时校验, 联合类型, 对象工厂, v-bind 批量传值) -->
      <PropsAdvancedDemo
        :mixed-id="parentPropCount % 2 === 0 ? 'ID_STRING_' + parentPropCount : parentPropCount"
        label="RequiredLabelPassedFromParent"
        :status="parentPropCount % 3 === 0 ? 'success' : parentPropCount % 3 === 1 ? 'warning' : 'running'"
        :is-compact="parentPropDisabled"
        v-bind="dynamicExtraProps"
        custom-attribute-demo="kebab-to-camel-test"
      />
    </view>

    <!-- ======================================================== -->
    <!-- 场景 2: v-model / defineModel 双向绑定与事件监听 -->
    <!-- ======================================================== -->
    <view v-if="activeTab === 'ALL' || activeTab === 'MODELS_EVENTS'">
      <view text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5>
        <text class="i-carbon-arrows-horizontal" text-amber-600 />
        <text>二、v-model 双向绑定与事件监听 (Declared vs Undeclared)</text>
      </view>

      <!-- 2.1 ModelTwoWayDemo -->
      <view mb-3 bg="white dark:gray-800" p-3 rounded-xl border="~ solid gray-200 dark:gray-700" text-xs>
        <view font-semibold text-gray-700 dark:text-gray-300 mb-2>
          父级绑定的状态监控 (在下方子组件输入或在 DevTools 修改均能实时同步):
        </view>
        <view grid grid-cols-2 gap-2 font-mono text="11px" bg="gray-50 dark:gray-900" p-2 rounded-lg mb-2>
          <view>parentModelText: <text text-amber-600 font-bold>{{ parentModelText }}</text></view>
          <view>parentModelCount: <text text-blue-600 font-bold>{{ parentModelCount }}</text></view>
          <view>parentModelTitle: <text text-purple-600 font-bold>{{ parentModelTitle }}</text></view>
          <view>parentModelActive: <text font-bold :class="parentModelActive ? 'text-emerald-500' : 'text-gray-400'">{{ String(parentModelActive) }}</text></view>
        </view>

        <ModelTwoWayDemo
          v-model="parentModelText"
          v-model:count="parentModelCount"
          v-model:title.capitalize="parentModelTitle"
          v-model:active="parentModelActive"
        />
      </view>

      <!-- 2.2 EventsEmitsDemo (Declared 与 Undeclared 事件监听) -->
      <EventsEmitsDemo
        @custom-submit="handleCustomSubmit"
        @count-change="handleCountChange"
        @reset="handleReset"
        @undeclared-event="handleUndeclaredEvent"
      />
    </view>

    <!-- ======================================================== -->
    <!-- 场景 3: 插槽与组件实例 Refs / defineExpose -->
    <!-- ======================================================== -->
    <view v-if="activeTab === 'ALL' || activeTab === 'SLOTS_REFS'">
      <view text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5>
        <text class="i-carbon-template" text-cyan-600 />
        <text>三、Slots 作用域插槽与 defineExpose / Refs 实例调用</text>
      </view>

      <!-- 3.1 SlotsScopedDemo -->
      <SlotsScopedDemo
        :header-title="'父级定制插槽标题'"
        :dynamic-slot-name="dynamicSlotName"
      >
        <!-- 具名插槽 header (消费作用域参数) -->
        <template #header="{ title, count, time }">
          <view flex items-center justify-between bg="cyan-50 dark:cyan-950/40" p-2 rounded-lg text-xs>
            <view flex items-center gap-1.5>
              <text class="i-carbon-star-filled" text-cyan-600 />
              <text font-bold text-cyan-800 dark:cyan-200>{{ title }} (父级定制)</text>
            </view>
            <text text="10px gray-400" font-mono>Count: {{ count }} | {{ time }}</text>
          </view>
        </template>

        <!-- 默认插槽 default (消费 summary) -->
        <template #default="{ summary }">
          <view p-2 bg="gray-50 dark:gray-900" rounded text-xs text-gray-600 dark:text-gray-300>
            <text font-semibold text-teal-600>父级注入默认插槽: </text>
            <text>{{ summary }}</text>
          </view>
        </template>

        <!-- 作用域列表插槽 item -->
        <template #item="{ row, index, isFirst, toggleStar }">
          <view
            flex items-center justify-between p-2 rounded text-xs
            :class="isFirst ? 'bg-cyan-100/50 dark:bg-cyan-900/40 border-l-3 border-cyan-500' : 'bg-gray-50 dark:gray-900'"
          >
            <view flex items-center gap-1.5>
              <text font-mono font-bold text-cyan-700 dark:cyan-300>#{{ index + 1 }}</text>
              <text font-medium>{{ row.title }}</text>
              <text text-gray-400 text="10px">by {{ row.author }}</text>
            </view>
            <button size="mini" bg="amber-500 text-white" px-2 py-0.5 rounded text-xs @click="toggleStar">
              ★ {{ row.stars }}
            </button>
          </view>
        </template>

        <!-- 扩展插槽 slot: extraSlot -->
        <template #extraSlot="{ extra }">
          <view p-2 rounded bg="purple-50 dark:purple-950/40" border="~ dashed purple-300" text-xs text-purple-700 dark:purple-300>
            ✨ 扩展插槽内容 (Extra 参数: {{ extra }})
          </view>
        </template>

        <!-- 具名插槽 footer -->
        <template #footer>
          <view text-xs text-gray-400 text-right>
            — 插槽由 index.vue 父级完成定制渲染 —
          </view>
        </template>
      </SlotsScopedDemo>

      <!-- 3.2 ExposeRefsDemo (父级通过 ref 访问子组件实例) -->
      <view class="demo-card" border="~ solid gray-200 dark:gray-700 rounded-xl" p-4 mb-4 bg="white dark:gray-800" shadow-sm>
        <view flex items-center justify-between border="b solid gray-100 dark:gray-700" pb-2 mb-3>
          <view flex items-center gap-2>
            <text class="i-carbon-cross-reference" text-emerald-600 text-lg />
            <text font-bold text-base text="gray-800 dark:gray-100">Parent Template Ref 实例调用测试</text>
          </view>
          <text text-xs text-emerald-600 font-mono>ref="exposeChildRef"</text>
        </view>

        <view flex flex-wrap gap-2 mb-3>
          <button size="mini" bg="emerald-600 text-white" px-3 py-1 rounded text-xs @click="callChildIncrement">
            父级调用 childRef.increment()
          </button>
          <button size="mini" bg="gray-600 text-white" px-3 py-1 rounded text-xs @click="callChildReset">
            父级调用 childRef.resetCount()
          </button>
          <button size="mini" bg="blue-600 text-white" px-3 py-1 rounded text-xs @click="readChildSnapshot">
            读取 childRef.getSnapshot()
          </button>
        </view>

        <view v-if="exposeCallResult" p-2 bg="gray-50 dark:gray-900" rounded text-xs font-mono text-emerald-600 mb-3>
          {{ exposeCallResult }}
        </view>

        <!-- 挂载带有 ref 的子组件 -->
        <ExposeRefsDemo ref="exposeChildRef" />
      </view>
    </view>

    <!-- ======================================================== -->
    <!-- 场景 4: Provide / Inject 跨层级依赖注入体系 -->
    <!-- ======================================================== -->
    <view v-if="activeTab === 'ALL' || activeTab === 'PROVIDE_INJECT'">
      <view text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5>
        <text class="i-carbon-tree-view" text-purple-600 />
        <text>四、Provide / Inject 跨多级响应式依赖注入体系</text>
      </view>

      <ProvideInjectParent />
    </view>

    <!-- ======================================================== -->
    <!-- 场景 5: 响应式全景与计算属性依赖图谱 -->
    <!-- ======================================================== -->
    <view v-if="activeTab === 'ALL' || activeTab === 'REACTIVITY'">
      <view text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5>
        <text class="i-carbon-chart-bubble" text-sky-500 />
        <text>五、响应式状态与可写计算属性 (Reactivity Graph)</text>
      </view>

      <ReactivityFullDemo />
    </view>

    <!-- ======================================================== -->
    <!-- 场景 6: Network 采集演示（W13） -->
    <view v-if="activeTab === 'ALL'" mt-6>
      <view text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5>
        <text class="i-carbon-api" text-indigo-500 />
        <text>六、网络请求采集 (Network)</text>
      </view>

      <NetworkDemoCard />
    </view>

    <!-- ======================================================== -->
    <!-- 场景 7: 递归组件与 KeepAlive 缓存组件 -->
    <!-- ======================================================== -->
    <view v-if="activeTab === 'ALL' || activeTab === 'TREE_KEEPALIVE'">
      <view text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5>
        <text class="i-carbon-flow" text-emerald-600 />
        <text>六、递归组件树与 KeepAlive 动态组件生命周期</text>
      </view>

      <!-- 6.1 TreeDemo 递归组件 -->
      <TreeDemo />

      <!-- 6.2 DynamicKeepAliveDemo 动态组件与 KeepAlive -->
      <DynamicKeepAliveDemo />
    </view>

    <!-- ======================================================== -->
    <!-- 场景 8: Attrs 透传与 inheritAttrs: false -->
    <!-- ======================================================== -->
    <view v-if="activeTab === 'ALL' || activeTab === 'PROPS'">
      <view text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5>
        <text class="i-carbon-layers" text-pink-600 />
        <text>七、非 Prop 属性透传 (Attrs & inheritAttrs: false)</text>
      </view>

      <AttrsFallthroughDemo
        declared-prop="已声明的普通 Prop"
        class="border-pink-500 shadow-md"
        style="padding: 14px; margin-bottom: 12px;"
        id="devtools-custom-attrs-root"
        data-testid="devtools-attrs-unit-test"
        aria-label="Accessible DevTools Attrs Card"
        custom-non-prop-flag="NON_PROP_VAL_99"
      />
    </view>

    <!-- ======================================================== -->
    <!-- 场景 9: Options API 全量语法支持 -->
    <!-- ======================================================== -->
    <view v-if="activeTab === 'ALL' || activeTab === 'OPTIONS_API'">
      <view text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5>
        <text class="i-carbon-script" text-violet-600 />
        <text>八、Options API 全量语法支持 (Data, Computed, Methods)</text>
      </view>

      <OptionsApiFullDemo
        title="父级传入的 Options API 组件标题"
        :initial-count="12"
        @custom-options-action="handleOptionsAction"
      />
    </view>

    <!-- ======================================================== -->
    <!-- 场景 10: 保留原有旧版沙盒组件 (保持向后兼容) -->
    <!-- ======================================================== -->
    <view v-if="activeTab === 'ALL' || activeTab === 'LEGACY'">
      <view text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5>
        <text class="i-carbon-cube" text-gray-600 />
        <text>九、旧版沙盒组件 (兼容保留)</text>
      </view>

      <view bg="white dark:gray-800" p-4 rounded-xl border="~ solid gray-200 dark:gray-700" mb-4>
        <InputEntry />
        <HiCounter />
        <TestComp />
        <OptionsScript />
        <CompositionScript />
      </view>
    </view>

    <!-- ======================================================== -->
    <!-- 底部: 实时事件监控控制台 (Event Monitor) -->
    <!-- ======================================================== -->
    <view
      bg="white dark:gray-800"
      border="~ solid gray-200 dark:gray-700 rounded-xl"
      p-3 shadow-md mt-6 text-xs
    >
      <view flex items-center justify-between border="b solid gray-100 dark:gray-700" pb-2 mb-2>
        <view flex items-center gap-2>
          <text class="i-carbon-terminal" text-emerald-600 />
          <text font-bold text-gray-800 dark:text-gray-100>实时事件与监听器控制台 (Event Monitor)</text>
          <text text="10px gray-400 font-mono">({{ eventLogs.length }} events)</text>
        </view>
        <button size="mini" bg="gray-200 dark:gray-700" text-xs px-2 py-0.5 rounded @click="eventLogs = []">
          清空
        </button>
      </view>

      <view v-if="eventLogs.length === 0" text-gray-400 py-3 text-center italic>
        暂无事件触发。在上方组件点击触发 Emit 按钮可在此处实时观察事件捕获。
      </view>

      <view v-else max-h-48 overflow-y-auto flex flex-col gap-1.5 font-mono text="11px">
        <view
          v-for="item in eventLogs"
          :key="item.id"
          p="x-2 y-1" rounded bg="gray-50 dark:gray-900" flex items-start justify-between gap-2
        >
          <view flex items-center gap-2 truncate>
            <text text-gray-400>{{ item.time }}</text>
            <text font-bold text-teal-600>{{ item.name }}</text>
          </view>
          <text text-gray-600 dark:text-gray-300 truncate max-w="280px">
            {{ JSON.stringify(item.payload) }}
          </text>
        </view>
      </view>
    </view>
  </view>
</template>

<style scoped>
.demo-card {
  transition: all 0.2s ease-in-out;
}
</style>

<route type="home" lang="json">
{}
</route>
