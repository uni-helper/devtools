import LZString from 'lz-string'

export function compressURLQuery(message: any) {
  return LZString.compressToEncodedURIComponent(JSON.stringify(message))
}

export function decompressURLQuery<T>(message: any): T {
  return JSON.parse(LZString.decompressFromEncodedURIComponent(message))
}
