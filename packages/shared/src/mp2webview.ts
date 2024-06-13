import LZString from 'lz-string'
import JSON5 from 'json5'

export function compressURLQuery(message: any) {
  return LZString.compressToEncodedURIComponent(JSON5.stringify(message))
}

export function decompressURLQuery<T>(message: any): T {
  return JSON5.parse(LZString.decompressFromEncodedURIComponent(message))
}
