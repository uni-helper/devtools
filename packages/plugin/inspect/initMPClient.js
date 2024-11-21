import { onMounted, version } from 'vue'
import { trpc } from './trpc'

export function initMPClient() {
  sendVersion()
  getCurrentPage()
}

function sendVersion() {
  const { uniRuntimeVersion } = uni.getSystemInfoSync()

  const vueVersion = version
  const uniVersion = uniRuntimeVersion

  trpc.sendVersion.subscribe({
    vueVersion,
    uniVersion,
  }, {
    onComplete: () => {},
  })
}

export function getCurrentPage() {
  onMounted(() => {
    // const i = getCurrentInstance()

    // const pages = getCurrentPages()
    // const i = pages[pages.length - 1]

    // console.log('instance', i)
  })
}
