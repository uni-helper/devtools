import { execaSync } from 'execa'

export function openInEditor(filePath: string) {
  execaSync`code ${filePath}`
}
