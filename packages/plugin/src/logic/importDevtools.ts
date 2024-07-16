import MagicString from 'magic-string'

export async function importDevtools(code: string, id: string) {
  const ms = new MagicString(code)
  const importer = [
    `import UniDevTools from '@uni-helper/devtools/inspect/UniDevTools.vue';`,
    `import {proxyConsole} from '@uni-helper/devtools/inspect/proxyConsole.js';`,
  ]
  const injectFunc = [
    `proxyConsole();`,
  ]
  const component = `app.component('uni-dev-tools', UniDevTools);`
  ms.prepend(`\n${injectFunc.join('\n')}\n`)
  ms.prepend(`${importer.join('\n')}\n`)
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
