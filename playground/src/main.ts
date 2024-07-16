import { createSSRApp } from 'vue'
import App from './App.vue'
import 'uno.css'
import * as Pinia from 'pinia';
console.log(1)
console.log('string')
console.log(true)
console.log(1000n)
console.log(Symbol('123'))
console.log(undefined)
console.log(null)
export function createApp() {
  const app = createSSRApp(App)
  app.use(Pinia.createPinia());
  return {
    app,
    Pinia
  }
}
