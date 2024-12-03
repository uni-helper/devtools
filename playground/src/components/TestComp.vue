<script>
import {defineComponent} from 'vue'
export default {
  setup() {
    const a = 1
    const r = ref(1)
    function name(params) {
      console.log(params)
    }
    const aa = () => {console.log(params)}
    const obj = {
      a: 1
    }
    return {
      a,
      r,
      name,
      aa,
      obj
    }
  }
}

</script>
<template>
  <div>
    <span @click="name">{{ a }}</span>
    <span @click="aa">{{ r }}</span>
    <span>{{ obj }}</span>
  </div>
</template>
