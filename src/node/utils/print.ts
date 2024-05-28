/* eslint-disable no-console */
import c from 'picocolors'

export function uniDevToolsPrint(port: number) {
  console.log(`  ${c.green('➜')}  ${c.bold('Uni Devtools')}: ${c.magenta(`http://localhost:${port}`)}`)
}
