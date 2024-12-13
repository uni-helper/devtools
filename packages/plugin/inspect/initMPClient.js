import { version } from 'vue'
import { onShow } from '@dcloudio/uni-app'

export function setVersion() {
  const { uniRuntimeVersion, uniPlatform } = uni.getSystemInfoSync()

  const vueVersion = version
  const uniVersion = uniRuntimeVersion
  /**
   * @type {import("@trpc/client").CreateTRPCProxyClient<import("./../src/index").AppRouter>}
   */
  // @ts-ignore
  const trpc = uni.$trpc
  trpc.setVersion.subscribe({
    vueVersion,
    uniVersion,
    uniPlatform,
  }, {
    onComplete: () => {},
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
  /**
   * @type {import("@trpc/client").CreateTRPCProxyClient<import("./../src/index").AppRouter>}
   */
  // @ts-ignore
  const trpc = uni.$trpc
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

    trpc.onChangeCurrentPage.subscribe(undefined, {
      onData: (data) => {
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
