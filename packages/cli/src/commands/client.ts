import { Application } from '@webviewjs/webview'

export function open(port: string) {
  const app = new Application()
  const window = app.createBrowserWindow({
    title: 'Uni Devtools',
  })
  window.createWebview({
    url: `http://localhost:${port}`,
    enableDevtools: false,
  })
  app.run()
}
