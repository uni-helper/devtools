<script setup lang="ts">
import PageIntro from '@/components/PageIntro.vue'

const count = ref(1)
const double = computed(() => count.value * 2)

const user = reactive({ name: 'Ada', age: 36, address: { city: '杭州' } })
const readonlyUser = readonly(user)
const summary = computed(() => `${user.name}（${user.age}）· ${user.address.city} · count=${count.value}`)

// 可写 computed：面板里可以直接编辑，setter 把值拆回 firstName / lastName
const firstName = ref('Ada')
const lastName = ref('Lovelace')
const fullName = computed({
  get: () => `${firstName.value} ${lastName.value}`,
  set: (value: string) => {
    const [first = '', ...rest] = value.trim().split(/\s+/)
    firstName.value = first
    lastName.value = rest.join(' ')
  },
})

// shallowRef：改内部字段不触发更新，triggerRef 后才刷新
const shallowConfig = shallowRef({ version: 1 })
function bumpSilently() {
  shallowConfig.value.version++
}
function forceUpdate() {
  triggerRef(shallowConfig)
}
</script>

<template>
  <view class="page">
    <PageIntro
      title="Composition API 状态"
      :checks="[
        'Components 选中 setup-state 页面节点：Setup 区有 count / double / user / fullName / shallowConfig 等',
        '面板里把 count 改成 5：页面显示 5，double 变 10',
        '面板里编辑 fullName 为 Grace Hopper：firstName / lastName 跟着变',
        'Reactivity Graph 需要 Vue 3.5+：当前 uni 版本的小程序运行时是 Vue 3.4，面板不显示该页签属预期',
      ]"
    />

    <view class="card">
      <view class="kv">
        count = {{ count }} · double = {{ double }}
      </view>
      <view class="btn" @click="count++">
        count +1
      </view>
    </view>

    <view class="card">
      <view class="kv">
        summary = {{ summary }}
      </view>
      <view class="kv">
        readonlyUser.name = {{ readonlyUser.name }}
      </view>
      <view class="btn" @click="user.age++">
        age +1
      </view>
    </view>

    <view class="card">
      <view class="kv">
        fullName = {{ fullName }}（firstName = {{ firstName }}，lastName = {{ lastName }}）
      </view>
    </view>

    <view class="card">
      <view class="kv">
        shallowConfig.version = {{ shallowConfig.version }}
      </view>
      <view class="btn" @click="bumpSilently">
        内部 +1（页面不变）
      </view>
      <view class="btn" @click="forceUpdate">
        triggerRef（页面刷新）
      </view>
    </view>
  </view>
</template>
