<template>
  <view class="index">
    <text class="title">{{ title }}</text>
    <anon-child from="page" />
    <named-child />
    <button class="btn" @click="runSelfCheck">
      探针自检
    </button>

    <view class="nav">
      <text class="nav-title">复杂使用场景（压依赖收集 / 数据捕捉）</text>
      <button size="mini" @click="go('/pages/state/state')">
        ① 数据捕捉压测
      </button>
      <button size="mini" @click="go('/pages/state/edge')">
        ② 序列化边界压测
      </button>
      <button size="mini" @click="go('/pages/reactivity/reactivity')">
        ③ 依赖关系 + 响应式压测
      </button>
      <text class="line">页面栈深度 = {{ stackDepth }}</text>
      <button size="mini" @click="refreshStack">
        刷新页面栈深度
      </button>
    </view>

    <view class="report">
      <text v-for="(line, i) in report" :key="i" class="line">{{ line }}</text>
    </view>
  </view>
</template>

<script>
import AnonChild from '@/components/AnonChild.vue'
import NamedChild from '@/components/NamedChild.vue'

/**
 * 真机自检：验证 devframe Vue 2 探针依赖的实例内部字段是否可用。
 * 对应讨论记录里的 S2（page.$vm）与 tree.ts 的 Vue 2 取值路径。
 */
export default {
  components: {
    AnonChild,
    NamedChild,
  },
  data() {
    return {
      title: 'uni-app Vue2 探针自检',
      report: [],
      stackDepth: 0,
    }
  },
  onShow() {
    this.refreshStack()
  },
  methods: {
    // 走 uni.navigateTo 而非 wx 原生：同时压探针的 navigate / getRouterInfo 两个 RPC
    go(path) {
      uni.navigateTo({
        url: path,
        fail: (err) => {
          this.report = [`navigateTo ${path} 失败: ${err && err.errMsg}`]
        },
      })
    },
    refreshStack() {
      const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : []
      this.stackDepth = pages.length
    },
    runSelfCheck() {
      const lines = []
      const push = (k, v) => lines.push(`${k}: ${v}`)

      // —— S2：页面实例上是否挂着 Vue 实例 ——
      const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : []
      push('getCurrentPages().length', pages.length)

      const page = pages[pages.length - 1]
      push('page.$vm 存在', !!page && !!page.$vm)
      push('page.$vm 类型', page && page.$vm ? typeof page.$vm : 'n/a')

      const vm = page && page.$vm
      if (!vm) {
        this.report = lines
        return
      }

      // —— tree.ts 的 Vue 2 取值路径 ——
      push('vm.$options 存在', !!vm.$options)
      push('vm.$options.__file', (vm.$options && vm.$options.__file) || '(空)')
      push('vm.$options.name', (vm.$options && vm.$options.name) || '(空)')
      push('vm._uid', vm._uid)
      push('vm.$children 是数组', Array.isArray(vm.$children))
      push('vm.$children.length', Array.isArray(vm.$children) ? vm.$children.length : 'n/a')
      push('vm._isDestroyed', vm._isDestroyed)
      push('vm.$data 存在', !!vm.$data)

      // —— 子组件节点（匿名组件能否靠 __file 命名）——
      const children = Array.isArray(vm.$children) ? vm.$children : []
      children.forEach((child, i) => {
        const opts = child.$options || {}
        const fallback = opts.__file ? String(opts.__file).split('/').pop().replace(/\.vue$/, '') : '(无 __file)'
        push(`$children[${i}]`, `name=${opts.name || '(空)'} __file=${opts.__file || '(空)'} → 兜底名=${fallback}`)
      })

      // —— 状态读取路径（Options API 无 setupState）——
      push('vm.setupState', typeof vm.setupState)
      push('vm._setupState', typeof vm._setupState)

      this.report = lines
    },
  },
}
</script>

<style>
.index {
  padding: 24rpx;
}
.title {
  display: block;
  margin-bottom: 16rpx;
  font-size: 32rpx;
}
.btn {
  margin: 24rpx 0;
}
.nav {
  display: flex;
  flex-direction: column;
  margin-bottom: 24rpx;
}
.nav-title {
  font-size: 24rpx;
  color: #666;
  margin-bottom: 8rpx;
}
.report {
  display: flex;
  flex-direction: column;
}
.line {
  font-size: 24rpx;
  line-height: 1.8;
}
</style>
