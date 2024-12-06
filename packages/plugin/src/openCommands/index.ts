import { exec } from 'node:child_process'
import open from 'open'
import launch from 'launch-editor'
import type { Options } from '../types'

export async function openInBrowser(url: string) {
  await open(url)
}

export function openInEditor(
  filePath: string,
  launchEditor: Options['launchEditor'],
) {
  launch(
    // filename:line:column
    // both line and column are optional
    filePath,
    // try specific editor bin first (optional)
    launchEditor,
    // callback if failed to launch (optional)
    (fileName: string, errorMsg: string) => {
      // log error if any
      console.error(`Failed to open ${fileName} in editor: ${errorMsg}`)
    },
  )
}

let PORT = 5015
export function savePort(port: number) {
  PORT = port
}

export function openInDevtools() {
  exec(`ud client ${PORT}`, (error, stdout, stderr) => {
    if (error) {
      console.error(`exec error: ${error}`)
      return
    }
    console.log(`stdout: ${stdout}`)
    console.error(`stderr: ${stderr}`)
  })
}
