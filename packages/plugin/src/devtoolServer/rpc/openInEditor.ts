import launch from 'launch-editor'
import type { Options } from '../../types'

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
