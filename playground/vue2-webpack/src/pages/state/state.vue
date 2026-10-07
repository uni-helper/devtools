<template>
  <view class="page">
    <text class="title">① 数据捕捉压测</text>
    <text class="hint">看面板能否完整列出 data / computed / props，以及嵌套路径可否就地编辑</text>

    <view class="card">
      <text class="sub">三层嵌套对象（可编辑路径 profile.address.geo.lat）</text>
      <text class="cell">name = {{ profile.name }}</text>
      <text class="cell">city = {{ profile.address.city }}</text>
      <text class="cell">lat = {{ profile.address.geo.lat }}</text>
      <text class="cell">meta.source = {{ profile.address.geo.meta.source }}</text>
    </view>

    <view class="card">
      <text class="sub">三层组件嵌套 + props 链（DeepA → DeepB → DeepC）</text>
      <deep-a ref="deepA" :payload="profile" />
    </view>

    <view class="card">
      <text class="sub">对象数组（v-for 复用同一匿名组件）</text>
      <list-row v-for="todo in todos" :key="todo.id" :item="todo" />
      <view class="row">
        <button size="mini" @click="addTodo">
          新增
        </button>
        <button size="mini" @click="toggleFirst">
          翻转 todos[0].done
        </button>
        <button size="mini" @click="appendTag">
          push todos[0].tags
        </button>
        <button size="mini" @click="removeLast">
          删末尾
        </button>
      </view>
    </view>

    <view class="card">
      <text class="sub">动态键（Vue.set / Vue.delete）</text>
      <text v-for="entry in dynamicList" :key="entry.key" class="cell">{{ entry.key }} = {{ entry.value }}</text>
      <view class="row">
        <button size="mini" @click="addDynamicKey">
          $set 新键
        </button>
        <button size="mini" @click="removeDynamicKey">
          $delete 末键
        </button>
      </view>
    </view>

    <view class="card">
      <text class="sub">mixin 合并（mixinCount / mixinDoubled 来自 mixin）</text>
      <text class="cell">mixinTag = {{ mixinTag }}</text>
      <text class="cell">mixinCount = {{ mixinCount }}</text>
      <text class="cell">mixinDoubled = {{ mixinDoubled }}</text>
      <button size="mini" @click="mixinBump">
        mixinBump()
      </button>
    </view>

    <view class="card">
      <text class="sub">computed 链（total → doneCount → progress）</text>
      <text class="cell">total = {{ total }}</text>
      <text class="cell">doneCount = {{ doneCount }}</text>
      <text class="cell">progress = {{ progress }}</text>
    </view>
  </view>
</template>

<script>
import DeepA from '@/components/DeepA.vue'
import ListRow from '@/components/ListRow.vue'
import counterMixin from '@/mixins/counter-mixin.js'

export default {
  components: {
    DeepA,
    ListRow,
  },
  mixins: [counterMixin],
  data() {
    return {
      profile: {
        name: 'Ada',
        address: {
          city: '上海',
          geo: {
            lat: 31.23,
            lng: 121.47,
            meta: { source: 'gps', accuracy: 5 },
          },
        },
      },
      todos: [
        { id: 1, text: '写复杂场景', done: false, tags: ['spike', 'vue2'] },
        { id: 2, text: '跑构建', done: true, tags: [] },
        { id: 3, text: '看面板', done: false, tags: ['panel'] },
      ],
      dynamic: { a: 1 },
      dynamicKeys: ['a'],
      seq: 0,
    }
  },
  computed: {
    dynamicList() {
      return this.dynamicKeys.map(key => ({ key, value: String(this.dynamic[key]) }))
    },
    total() {
      return this.todos.length
    },
    doneCount() {
      return this.todos.filter(todo => todo.done).length
    },
    progress() {
      return this.total ? Math.round((this.doneCount / this.total) * 100) : 0
    },
  },
  methods: {
    addTodo() {
      this.seq += 1
      this.todos.push({ id: 100 + this.seq, text: `新增 #${this.seq}`, done: false, tags: [] })
    },
    toggleFirst() {
      if (this.todos.length) {
        this.todos[0].done = !this.todos[0].done
      }
    },
    appendTag() {
      if (this.todos.length) {
        this.todos[0].tags.push(`t${Date.now() % 1000}`)
      }
    },
    removeLast() {
      this.todos.pop()
    },
    addDynamicKey() {
      this.seq += 1
      const key = `k${this.seq}`
      this.$set(this.dynamic, key, `v${this.seq}`)
      this.dynamicKeys.push(key)
    },
    removeDynamicKey() {
      const key = this.dynamicKeys.pop()
      if (key) {
        this.$delete(this.dynamic, key)
      }
    },
  },
}
</script>

<style>
.page {
  padding: 24rpx;
}
.title {
  display: block;
  font-size: 32rpx;
  margin-bottom: 8rpx;
}
.hint {
  display: block;
  font-size: 22rpx;
  color: #888;
  margin-bottom: 16rpx;
}
.card {
  border: 1rpx solid #ddd;
  border-radius: 8rpx;
  padding: 16rpx;
  margin-bottom: 16rpx;
}
.sub {
  display: block;
  font-size: 26rpx;
  font-weight: bold;
  margin-bottom: 8rpx;
}
.cell {
  display: block;
  font-size: 24rpx;
  line-height: 1.7;
}
.row {
  display: flex;
  flex-wrap: wrap;
}
</style>
