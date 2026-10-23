<script setup lang="ts">
import PageIntro from '@/components/PageIntro.vue'
import AttrsReceiver from '@/components/parent-child/AttrsReceiver.vue'
import EventEmitter from '@/components/parent-child/EventEmitter.vue'
import ExposedCounter from '@/components/parent-child/ExposedCounter.vue'
import ModelInput from '@/components/parent-child/ModelInput.vue'
import PropsShowcase, { type ShowcaseUser } from '@/components/parent-child/PropsShowcase.vue'
import SlotList from '@/components/parent-child/SlotList.vue'

// props：固定值，覆盖基础类型、嵌套对象、数组、函数与几种特殊对象
const count = ref(1)
const user = reactive<ShowcaseUser>({
  id: 1001,
  name: 'Ada',
  address: { city: '杭州', geo: { lat: 30.27, lng: 120.15 } },
})
const tags = ['vue', 'uni-app']
const createdAt = new Date('2024-01-01T00:00:00Z')
const pattern = /^uni-/
const meta = new Map([['env', 'dev'], ['region', 'cn']])
const flags = new Set(['read', 'write'])
const token = Symbol('session')
const format = (value: number) => `#${value}`

function renameUser() {
  user.name = user.name === 'Ada' ? 'Grace' : 'Ada'
}

// v-model
const modelText = ref('hello')
const modelCount = ref(0)

// 事件
const lastEvent = ref('（无）')

// 插槽
const slotItems = ['first', 'second']

// expose
const exposedRef = ref<InstanceType<typeof ExposedCounter>>()
</script>

<template>
  <view class="page">
    <PageIntro
      title="父子通信"
      :checks="[
        'PropsShowcase 的 Props 区：Date / RegExp 显示为字符串，函数 / Symbol 显示为 <unserializable>；Map / Set 目前显示为 {}（探针序列化尚未支持）',
        '点「count +1」「改名」：PropsShowcase 的 props 在面板里同步更新',
        'AttrsReceiver 的 Attrs 区有 id / tone / aria-label，label 只在 Props 区（data-* 在 mp 下是原生 dataset，不进 attrs）',
        'ModelInput：面板里看到 modelValue / count 两个 model；子组件改值父组件同步',
        'EventEmitter：两个按钮都能让上方「最近一次」变化；submit 已声明，undeclared 未声明',
      ]"
    />

    <view class="card">
      <view class="card-title">
        Props
      </view>
      <PropsShowcase
        title="PropsShowcase"
        :count="count"
        :disabled="false"
        :remark="null"
        :user="user"
        :tags="tags"
        :format="format"
        :created-at="createdAt"
        :pattern="pattern"
        :meta="meta"
        :flags="flags"
        :token="token"
      />
      <view class="btn" @click="count++">
        count +1
      </view>
      <view class="btn" @click="renameUser">
        改名
      </view>
    </view>

    <view class="card">
      <view class="card-title">
        Attrs 透传
      </view>
      <AttrsReceiver id="attrs-root" label="已声明的 prop" tone="warm" aria-label="attrs demo" />
    </view>

    <view class="card">
      <view class="card-title">
        v-model（父组件：text = {{ modelText }}，count = {{ modelCount }}）
      </view>
      <ModelInput v-model="modelText" v-model:count="modelCount" />
    </view>

    <view class="card">
      <view class="card-title">
        事件（最近一次：{{ lastEvent }}）
      </view>
      <EventEmitter
        @submit="(payload) => (lastEvent = `submit ${JSON.stringify(payload)}`)"
        @undeclared="(value: string) => (lastEvent = `undeclared ${value}`)"
      />
    </view>

    <view class="card">
      <view class="card-title">
        作用域插槽
      </view>
      <SlotList :items="slotItems">
        <template #row="{ item, index }">
          <view class="kv">
            {{ index + 1 }}. {{ item }}（由父组件渲染）
          </view>
        </template>
      </SlotList>
    </view>

    <view class="card">
      <view class="card-title">
        defineExpose
      </view>
      <ExposedCounter ref="exposedRef" />
      <view class="btn" @click="exposedRef?.increment()">
        父组件调用 increment()
      </view>
    </view>
  </view>
</template>
