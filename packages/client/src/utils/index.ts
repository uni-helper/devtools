type ENV = 'mp' | 'h5' | 'desktop'

export function getEnv(): ENV {
  let env: ENV = 'h5'
  // @ts-expect-error uni在webview的js-sdk中有getEnv方法
  uni.getEnv(({ h5 }) => {
    if (h5) {
      if ((window as any).__devtools_desktop_env) {
        env = 'desktop'
      }
      else {
        env = 'h5'
      }
    }
    else {
      env = 'mp'
    }
  })
  return env
}
