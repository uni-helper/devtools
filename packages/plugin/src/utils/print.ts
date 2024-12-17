/* eslint-disable no-console */
import readline from 'node:readline'
import process from 'node:process'
import c from 'picocolors'
import { openInBrowser, openInDevtools } from '../openCommands'

const SHORTCUTS = [
  {
    key: 'd',
    description: 'open Uni Devtools client in desktop',
    action: () => {
      openInDevtools()
    },
  },
  {
    key: 'o',
    description: 'open Uni Devtools client in browser',
    action: (port: number) => {
      openInBrowser(`http://localhost:${port}`)
    },
  },
  {
    key: 'c',
    description: 'clear console',
    action: () => {
      process.stdout.write('\x1Bc')
    },
  },
  {
    key: 'q',
    description: 'quit',
    action: () => {
      process.exit(0)
    },
  },
]

export function uniDevToolsPrint(port: number) {
  // console.clear()
  console.log()
  console.log(`  ${c.green('➜')}  ${c.bold('Uni Devtools')}: ${c.magenta(`http://localhost:${port}`)}`)
  console.log(`  ${c.dim('press ')}${c.bold('h')}${c.dim(` to show help`)}`)
  console.log()

  const onInput = (input: string) => {
    if (input === 'h') {
      const loggedKeys = new Set<string>()
      console.log('\n Shortcuts:')

      for (const shortcut of SHORTCUTS) {
        if (!loggedKeys.has(shortcut.key)) {
          console.log(`${c.dim(' press ')}${c.bold(`${shortcut.key}`)}${c.dim(` to ${shortcut.description}`)}`)
          loggedKeys.add(shortcut.key)
        }
      }
    }
    const shortcut = SHORTCUTS.find(i => i.key === input)
    if (!shortcut)
      return
    shortcut.action(port)
  }

  const rl = readline.createInterface({ input: process.stdin })
  rl.on('line', onInput)
}
