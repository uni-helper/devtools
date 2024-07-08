import rfdc from 'rfdc'

export function basename(filename: string, ext: string): string {
  const normalizedFilename = filename.replace(/^[a-z]:/i, '').replace(/\\/g, '/')
  const lastSlashIndex = normalizedFilename.lastIndexOf('/')
  const baseNameWithExt = normalizedFilename.substring(lastSlashIndex + 1)

  if (ext) {
    const extIndex = baseNameWithExt.lastIndexOf(ext)
    return baseNameWithExt.substring(0, extIndex)
  }
  return ''
}

export const deepClone = rfdc({ circles: true })
