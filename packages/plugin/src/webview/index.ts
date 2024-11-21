import { Application } from '@webviewjs/webview'

export function open(port: number) {
  const app = new Application()
  const window = app.createBrowserWindow()
  console.log(`http://localhost:${port}`)
  window.createWebview({
    url: `http://localhost:${port}`,
  })
  app.run()
}
