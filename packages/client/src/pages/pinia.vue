<script setup lang="ts">
const { initState } = useInitState()
const piniaState = initState.value.piniaState
</script>

<template>
  <div>
    {{ piniaState }}
  </div>
</template>
