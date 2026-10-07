/**
 * 验证 mixin 提供的 data / computed / method 能否被探针采集到。
 *
 * Vue 2 在实例化时已把 mixins 合并进 `$options`，因此 `state.ts` 的
 * `resolveMergedOptions` 在 Vue 2 分支直接返回 `$options`（不重跑合并）。
 * 这一页就是那条分支的实测用例：mixinDoubled 应当出现在 computed 段。
 */
export default {
  data() {
    return {
      mixinCount: 0,
      mixinTag: 'from-mixin',
    }
  },
  computed: {
    mixinDoubled() {
      return this.mixinCount * 2
    },
  },
  methods: {
    mixinBump() {
      this.mixinCount += 1
    },
  },
}
