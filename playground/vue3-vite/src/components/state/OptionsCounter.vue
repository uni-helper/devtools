<script>
// 写法一：纯 Options API（普通 <script>，无 setup）
export default {
  name: 'OptionsCounter',
  props: {
    step: { type: Number, default: 1 },
  },
  data() {
    return {
      count: 0,
      config: { debug: true, retries: 3 },
      firstName: '张',
      lastName: '三',
    }
  },
  computed: {
    double() {
      return this.count * 2
    },
    // 可写 computed：面板 Computed 区可直接编辑
    fullName: {
      get() {
        return `${this.firstName} ${this.lastName}`
      },
      set(value) {
        const [first = '', ...rest] = value.trim().split(/\s+/)
        this.firstName = first
        this.lastName = rest.join(' ')
      },
    },
  },
  methods: {
    increment() {
      this.count += this.step
    },
  },
}
</script>

<template>
  <view class="kv">
    OptionsCounter：count = {{ count }} · double = {{ double }} · fullName = {{ fullName }}
  </view>
  <view class="btn" @click="increment">
    +{{ step }}
  </view>
</template>
