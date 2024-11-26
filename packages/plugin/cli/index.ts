#!/usr/bin/env node

import process from 'node:process'
import readline from 'node:readline'
import cac from 'cac'
import c from 'picocolors'
import { version } from '../package.json'
import { open } from './commands/client'

const cli = cac('ud')

cli
  .version(version)
  .help()

cli
  .command('client <port>')
  .action((port: string) => {
    open(port)
  })

cli.on('command:*', () => {
  // eslint-disable-next-line no-console
  console.log()
  console.error(
    c.inverse(c.red(' ERROR ')) + c.white(' Unknown command: %s'),
    cli.args.join(' '),
  )
  // eslint-disable-next-line no-console
  console.log()
  cli.outputHelp()
  process.exit(1)
})

cli.parse()

const rl = readline.createInterface({ input: process.stdin })
rl.on('line', (input) => {
  console.log(`Received: ${input}`)
})
