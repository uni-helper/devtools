<template>
  <view class="page">
    <text class="title">② 序列化边界压测</text>
    <text class="hint">看面板遇到非纯 JSON 数据时的降级行为，以及探针会不会整段崩掉</text>

    <view class="card">
      <text class="sub">特殊值降级对照</text>
      <text class="cell">Date → {{ dateText }}</text>
      <text class="cell">RegExp → {{ regexpText }}</text>
      <text class="cell">BigInt → {{ bigintText }}</text>
      <text class="cell">NaN / Infinity → {{ nanText }} / {{ infText }}</text>
      <text class="cell">Error → {{ errorText }}</text>
      <text class="cell">数组含 undefined/NaN → {{ arrayText }}</text>
    </view>

    <view class="card">
      <text class="sub">键名过滤（嵌套层 _ / $ 前缀被丢）</text>
      <text class="cell">_secret → {{ underscoreText }}</text>
      <text class="cell">$dollar → {{ dollarText }}</text>
      <text class="cell">visible → {{ visibleText }}</text>
    </view>

    <view class="card">
      <text class="sub">循环引用（created 里挂 self）</text>
      <text class="cell">circular.self === circular → {{ circularSelfText }}</text>
      <text class="cell">circular.name → {{ circularName }}</text>
    </view>

    <view class="card">
      <text class="sub">超过 6 层深度</text>
      <text class="cell">第 5 层（可达）→ {{ deep5Text }}</text>
      <text class="cell">第 7 层（应被截断）→ {{ deep7Text }}</text>
    </view>

    <view class="card">
      <text class="sub">大数组（500 项）</text>
      <text class="cell">bigList.length → {{ bigListLength }}</text>
      <text class="cell">首项 → {{ bigListFirst }}</text>
      <text class="cell">末项 → {{ bigListLast }}</text>
      <button size="mini" @click="mutateBigList">
        改 bigList[250].v
      </button>
    </view>

    <view class="card">
      <text class="sub">函数值键（应完全不出现）</text>
      <text class="cell">顶层 fn / 嵌套 nestedFn.inner 都会被跳过</text>
    </view>
  </view>
</template>

<script>
export default {
  data() {
    return {
      d: {
        date: new Date('2026-10-06T08:30:00.000Z'),
        regexp: /vue2?/gi,
        bigint: typeof BigInt === 'function' ? BigInt('9007199254740993') : '<no bigint>',
        nan: NaN,
        inf: Infinity,
        undef: undefined,
        nullValue: null,
        error: new Error('boom'),
        underscore: { _secret: 'should-be-dropped', $dollar: 'should-be-dropped', visible: 'kept' },
        array: [1, undefined, NaN, 'tail'],
        nestedFn: { inner: function inner() {}, kept: 'kept' },
        deepChain: {
          l1: {
            l2: {
              l3: {
                l4: {
                  l5: {
                    l6: {
                      l7: {
                        l8: 'too-deep',
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      // 顶层函数键：state.ts 的 data 段会直接 continue，整个键不出现
      fn: function topLevelFn() {},
      circular: { name: 'loop-node' },
      bigList: [],
    }
  },
  computed: {
    dateText() {
      return this.d.date instanceof Date ? this.d.date.toISOString() : String(this.d.date)
    },
    regexpText() {
      return String(this.d.regexp)
    },
    bigintText() {
      return typeof this.d.bigint === 'bigint' ? `${this.d.bigint}n` : String(this.d.bigint)
    },
    nanText() {
      return String(this.d.nan)
    },
    infText() {
      return String(this.d.inf)
    },
    errorText() {
      return this.d.error instanceof Error ? `${this.d.error.name}: ${this.d.error.message}` : String(this.d.error)
    },
    arrayText() {
      return JSON.stringify(this.d.array)
    },
    underscoreText() {
      return '_secret' in this.d.underscore ? String(this.d.underscore._secret) : '(无)'
    },
    dollarText() {
      return '$dollar' in this.d.underscore ? String(this.d.underscore.$dollar) : '(无)'
    },
    visibleText() {
      return String(this.d.underscore.visible)
    },
    circularSelfText() {
      return this.circular.self === this.circular ? '是' : '否'
    },
    circularName() {
      return String(this.circular.name)
    },
    deep5Text() {
      const chain = this.d.deepChain
      return String(chain.l1.l2.l3.l4.l5)
    },
    deep7Text() {
      const chain = this.d.deepChain
      return String(chain.l1.l2.l3.l4.l5.l6.l7)
    },
    bigListLength() {
      return this.bigList.length
    },
    bigListFirst() {
      return this.bigList.length ? this.bigList[0].v : '(空)'
    },
    bigListLast() {
      return this.bigList.length ? this.bigList[this.bigList.length - 1].v : '(空)'
    },
  },
  created() {
    // 循环引用：Vue 2 的 Observer 先用 __ob__ 标记再递归，不会死循环
    this.circular.self = this.circular

    const list = []
    for (let i = 0; i < 500; i++) {
      list.push({ id: i, v: i * 2, label: `row-${i}` })
    }
    this.bigList = list
  },
  methods: {
    mutateBigList() {
      if (this.bigList.length > 250) {
        this.bigList[250].v = -this.bigList[250].v
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
  word-break: break-all;
}
</style>
