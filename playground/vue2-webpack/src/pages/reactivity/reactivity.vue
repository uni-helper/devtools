<template>
  <view class="page">
    <text class="title">③ 依赖关系 + 响应式压测</text>
    <text class="hint">computed 链 / setter / deep watch / 数组 / 分支切换 / 插槽 / 定时器</text>

    <view class="card">
      <text class="sub">computed 链：base → doubled → quadrupled</text>
      <text class="cell">base = {{ base }}</text>
      <text class="cell">doubled = {{ doubled }}</text>
      <text class="cell">quadrupled = {{ quadrupled }}</text>
      <view class="row">
        <button size="mini" @click="base += 1">
          base +1
        </button>
        <button size="mini" @click="base = 0">
          base 归零
        </button>
      </view>
    </view>

    <view class="card">
      <text class="sub">computed setter（面板里应显示 editable）</text>
      <text class="cell">editableTotal = {{ editableTotal }}</text>
      <text class="cell">subtotal = {{ subtotal }}</text>
      <text class="cell">tax = {{ tax }}</text>
      <text class="cell">total = {{ total }}</text>
      <button size="mini" @click="editableTotal = 200">
        写 editableTotal = 200
      </button>
    </view>

    <view class="card">
      <text class="sub">v-for + 子组件改 props 对象（PriceRow）</text>
      <price-row
        v-for="item in items"
        :key="item.id"
        :item="item"
        @changed="onRowChanged"
      />
      <text class="cell">lastChanged = {{ lastChanged }}</text>
      <button size="mini" @click="addItem">
        追加一行
      </button>
    </view>

    <view class="card">
      <text class="sub">deep watch（改 items[0].qty 会触发）</text>
      <text class="cell">watchHits = {{ watchHits }}</text>
      <text class="cell">watchLog = {{ watchLogText }}</text>
      <button size="mini" @click="bumpFirstQty">
        items[0].qty +1
      </button>
    </view>

    <view class="card">
      <text class="sub">v-if / v-else 切换组件（替代动态组件）</text>
      <text class="cell">showA = {{ showA }}</text>
      <panel-a v-if="showA" ref="panelA" />
      <panel-b v-else ref="panelB" />
      <button size="mini" @click="showA = !showA">
        切换分支
      </button>
    </view>

    <view class="card">
      <text class="sub">插槽：默认 / 具名 / 作用域</text>
      <slot-host>
        <text>默认插槽内容</text>
        <template v-slot:footer>
          <text>footer 插槽内容</text>
        </template>
        <template v-slot:row="{ label, index }">
          <text>作用域插槽：{{ label }} #{{ index }}</text>
        </template>
      </slot-host>
    </view>

    <view class="card">
      <text class="sub">定时器异步改数据（压快照轮询兜底）</text>
      <text class="cell">tick = {{ tick }}</text>
      <text class="cell">timerOn = {{ timerOn }}</text>
      <button size="mini" @click="toggleTimer">
        {{ timerOn ? '停止' : '启动' }} 1s 定时器
      </button>
    </view>
  </view>
</template>

<script>
import PanelA from '@/components/PanelA.vue'
import PanelB from '@/components/PanelB.vue'
import PriceRow from '@/components/PriceRow.vue'
import SlotHost from '@/components/SlotHost.vue'

export default {
  components: {
    PanelA,
    PanelB,
    PriceRow,
    SlotHost,
  },
  data() {
    return {
      base: 2,
      items: [
        { id: 1, label: '键盘', qty: 2, price: 199.5 },
        { id: 2, label: '鼠标', qty: 1, price: 89 },
      ],
      seq: 0,
      showA: true,
      tick: 0,
      timerOn: false,
      lastChanged: '-',
      watchHits: 0,
      watchLog: [],
    }
  },
  computed: {
    doubled() {
      return this.base * 2
    },
    quadrupled() {
      return this.doubled * 2
    },
    subtotal() {
      return Number(this.items.reduce((sum, item) => sum + item.qty * item.price, 0).toFixed(2))
    },
    tax() {
      return Number((this.subtotal * 0.13).toFixed(2))
    },
    total() {
      return Number((this.subtotal + this.tax).toFixed(2))
    },
    // 带 setter 的 computed：面板应把 editable 标成 true
    editableTotal: {
      get() {
        return this.total
      },
      set(next) {
        this.base = Number(next) / 4
      },
    },
    watchLogText() {
      return this.watchLog.length ? this.watchLog.join(' | ') : '(空)'
    },
  },
  watch: {
    base(next, prev) {
      this.recordWatch(`base ${prev}→${next}`)
    },
    quadrupled(next) {
      this.recordWatch(`quadrupled=${next}`)
    },
    items: {
      deep: true,
      handler() {
        this.recordWatch('items(deep)')
      },
    },
  },
  onUnload() {
    this.stopTimer()
  },
  beforeDestroy() {
    this.stopTimer()
  },
  methods: {
    recordWatch(line) {
      this.watchHits += 1
      this.watchLog.unshift(`${this.watchHits}. ${line}`)
      if (this.watchLog.length > 5) {
        this.watchLog.pop()
      }
    },
    onRowChanged(id) {
      this.lastChanged = `row#${id}`
    },
    addItem() {
      this.seq += 1
      this.items.push({ id: 100 + this.seq, label: `新增${this.seq}`, qty: 1, price: 10 })
    },
    bumpFirstQty() {
      if (this.items.length) {
        this.items[0].qty += 1
      }
    },
    toggleTimer() {
      if (this.timerOn) {
        this.stopTimer()
        return
      }
      this.timerOn = true
      this.timer = setInterval(() => {
        this.tick += 1
      }, 1000)
    },
    stopTimer() {
      if (this.timer) {
        clearInterval(this.timer)
        this.timer = null
      }
      this.timerOn = false
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
