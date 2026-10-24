import Vue from 'vue'
import App from './App'
import store from './store'

Vue.config.productionTip = false

// 挂载 Vuex store（uni-app Vue 2 方式）
Vue.prototype.$store = store

App.mpType = 'app'

const app = new Vue({
  store,
  ...App,
})
app.$mount()
