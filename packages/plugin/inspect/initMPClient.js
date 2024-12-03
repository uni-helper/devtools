import { version } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { trpc } from './trpc'

export function setVersion() {
  const { uniRuntimeVersion, uniPlatform } = uni.getSystemInfoSync()

  const vueVersion = version
  const uniVersion = uniRuntimeVersion

  trpc.setVersion.subscribe({
    vueVersion,
    uniVersion,
    uniPlatform,
  }, {
    onComplete: () => { console.log('sendVersion success') },
  })
  console.log('sendVersion', {
    vueVersion,
    uniVersion,
    uniPlatform,
  })
}

/**
 * 递归获取组件名称和地址
 * @param {*} component
 * @returns {import("@uni-helper/devtools-types").ComponentTreeNode | null}
 */
function extractComponentInfo(component) {
  const { type } = component.$
  const name = type.fileName || 'App'
  if (name === 'UniDevTools')
    return null
  const file = type.filePath
  const componentInfo = {
    name,
    file,
    id: component.$.uid,
  }

  if (component.$children?.length > 0) {
    componentInfo.children = component.$children.map(extractComponentInfo).filter(c => c !== null)
  }

  return componentInfo
}

export function setCurrentPage() {
  console.log('initMPClient')
  onShow(() => {
    // eslint-disable-next-line no-undef
    const pages = getCurrentPages()
    const currentPage = pages[pages.length - 1]
    trpc.setCurrentPage.subscribe(
      currentPage.route || '',
      {
        onComplete: () => {},
      },
    )

    const vm = currentPage.$vm
    console.log('setCurrentPage', vm)
    const componentTree = extractComponentInfo(vm)
    trpc.setComponentTree.subscribe(componentTree, {
      onComplete: () => {},
    })

    trpc.onChangeCurrentPage.subscribe(undefined, {
      onData: (data) => {
        console.log('onChangeCurrentPage', data)
        if (data.isTabBar) {
          uni.switchTab({
            url: data.page,
          })
        }
        else {
          uni.redirectTo({
            url: data.page,
          })
        }
      },
    })
  })
}

export function initMPClient() {
  setVersion()
}
