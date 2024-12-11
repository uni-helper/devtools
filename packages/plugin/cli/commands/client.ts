import { Application } from '@webviewjs/webview'

export function open(port: string) {
  const app = new Application()
  const window = app.createBrowserWindow({
    title: 'Uni Devtools',
    alwaysOnTop: true,
    width: 1600,
    height: 900,
  })
  window.createWebview({
    url: `http://localhost:${port}`,
    enableDevtools: false,
    preload: /* js */`window.__devtools_desktop_env=true`,
  })
  app.run()
}
