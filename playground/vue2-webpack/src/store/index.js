import Vue from 'vue'
import Vuex from 'vuex'

Vue.use(Vuex)

const store = new Vuex.Store({
  state: {
    count: 0,
    message: 'Hello Vuex',
    user: {
      name: 'Test User',
      age: 25,
    },
  },
  getters: {
    doubleCount: state => state.count * 2,
    userInfo: state => `${state.user.name}, ${state.user.age} years old`,
  },
  mutations: {
    increment(state) {
      state.count++
    },
    setMessage(state, message) {
      state.message = message
    },
    setUserName(state, name) {
      state.user.name = name
    },
  },
  actions: {
    incrementAsync({ commit }) {
      setTimeout(() => {
        commit('increment')
      }, 1000)
    },
  },
  modules: {
    cart: {
      namespaced: true,
      state: {
        items: [],
        total: 0,
      },
      getters: {
        itemCount: state => state.items.length,
      },
      mutations: {
        addItem(state, item) {
          state.items.push(item)
          state.total += item.price
        },
      },
    },
  },
})

export default store
