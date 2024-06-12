import MagicString from 'magic-string'

export async function importDevtools(code: string, id: string) {
  const ms = new MagicString(code)
  const importer = `import UniDevTools from '@uni-helper/devtools/inspect/UniDevTools.vue'`
  const component = `app.component('uni-dev-tools', UniDevTools);`
  ms.append(`\n${importer}`)
  ms.replace(
    /(createApp[\s\S]*?)(return\s{\s*app)/,
    `$1${`${component}\n`}$2`,
  )
  const map = ms.generateMap({
    source: id,
    file: `${id}.map`,
    includeContent: true,
  })
  code = ms.toString()
  return {
    code,
    map,
  }
}
