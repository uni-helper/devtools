<script>
export default {
  data() {
    return {
      count: 1
    }
  },
  watch: {
    count: {
      handler(newVal, oldVal) {
        console.log('count changed:', newVal, oldVal);
        // 在这里处理数据变化的逻辑
      },
      deep: true
    }
  },
  watch: {
    '$data': {
      handler(newVal, oldVal) {
        console.log('Data changed:', newVal, oldVal);
        // 在这里处理数据变化的逻辑
      },
      deep: true,
      immediate: true
    }
  },

  // `mounted` 是生命周期钩子，之后我们会讲到
  mounted() {
    // `this` 指向当前组件实例
    console.log(this.count) // => 1

    // 数据属性也可以被更改
    // this.count = 2
  }
}
</script>

<template>
  {{ count }}
  <button @click="count++">Count</button>
</template>
