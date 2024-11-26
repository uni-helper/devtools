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
 * @returns {import("@uni-helper/devtools-types").ComponentTreeNode}
 */
function extractComponentInfo(component) {
  const { type } = component.$

  const name = type.fileName
  const file = type.filePath
  const componentInfo = { name, file }

  if (component.$children?.length > 0) {
    componentInfo.children = component.$children.map(extractComponentInfo).filter(c => c !== null)
  }

  return componentInfo
}

export function setCurrentPage() {
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
    const componentTree = extractComponentInfo(vm)
    trpc.setComponentTree.subscribe(componentTree, {
      onComplete: () => {},
    })
    console.log('setCurrentPage', currentPage.route)
    console.log('setComponentTree', componentTree)
  })
}

export function initMPClient() {
  setVersion()
}
