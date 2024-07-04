import MagicString from 'magic-string'

export async function importDevtools(code: string, id: string) {
  const ms = new MagicString(code)
  const importer = [
    `import UniDevTools from '@uni-helper/devtools/inspect/UniDevTools.vue';`,
    `import {proxyLog} from '@uni-helper/devtools/inspect/proxyLog.js';`,
  ]
  const injectFunc = [
    `proxyLog();`,
  ]
  const component = `app.component('uni-dev-tools', UniDevTools);`
  ms.appendRight(0, `${importer.join('\n')}\n`)
  ms.append(`\n${injectFunc.join('\n')}\n`)
  ms.replace(
    /(createApp[\s\S]*?)(return\s\{\s*app)/,
    `$1${`${component}\n`}$2`,
  )
  const map = ms.generateMap({
    source: id,
    file: `${id}.map`,
    includeContent: true,
  })
  return {
    code: ms.toString(),
    map,
  }
}
