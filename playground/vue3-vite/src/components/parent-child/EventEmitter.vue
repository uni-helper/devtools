<script setup lang="ts">
// 只声明 submit；undeclared 走组件实例的 emit 绕过声明——面板里应标为未声明事件
const emit = defineEmits<{ submit: [payload: { id: number, message: string }] }>()
const instance = getCurrentInstance()

function submit() {
  emit('submit', { id: 1, message: 'hello' })
}
function fireUndeclared() {
  instance?.emit('undeclared', 'not-declared')
}
</script>

<template>
  <view class="btn" @click="submit">
    emit('submit')
  </view>
  <view class="btn" @click="fireUndeclared">
    触发未声明事件
  </view>
</template>
