import fs from 'node:fs/promises'
import fg from 'fast-glob'
import { join, resolve } from 'pathe'
import type { ResolvedConfig } from 'vite'
import mime from 'mime'
import type { ImageMeta } from 'image-meta'
import { imageMeta } from 'image-meta'
import type { AssetInfo, AssetType } from '../../types'

function guessType(path: string): AssetType {
  if (/\.(?:png|jpe?g|jxl|gif|svg|webp|avif|ico|bmp|tiff?)$/i.test(path))
    return 'image'
  if (/\.(?:mp4|webm|ogv|mov|avi|flv|wmv|mpg|mpeg|mkv|3gp|3g2|ts|mts|m2ts|vob|ogm|ogx|rm|rmvb|asf|amv|divx|m4v|svi|viv|f4v|f4p|f4a|f4b)$/i.test(path))
    return 'video'
  if (/\.(?:mp3|wav|ogg|flac|aac|wma|alac|ape|ac3|dts|tta|opus|amr|aiff|au|mid|midi|ra|rm|wv|weba|dss|spx|vox|tak|dsf|dff|dsd|cda)$/i.test(path))
    return 'audio'
  if (/\.(?:woff2?|eot|ttf|otf|ttc|pfa|pfb|pfm|afm)/i.test(path))
    return 'font'
  if (/\.(?:json[5c]?|te?xt|[mc]?[jt]sx?|md[cx]?|markdown|ya?ml|toml)/i.test(path))
    return 'text'
  if (/\.wasm/i.test(path))
    return 'wasm'
  return 'other'
}

function guessMimeType(path) {
  // 如果无法确定类型，默认为'application/octet-stream'
  return mime.getType(path) || 'application/octet-stream'
}

export async function getStaticAssets(config: ResolvedConfig): Promise<AssetInfo[]> {
  const baseURL = config.base

  const files = await fg([
    // image
    '**/*.(png|jpg|jpeg|gif|svg|webp|avif|ico|bmp|tiff)',
    // video
    '**/*.(mp4|webm|ogv|mov|avi|flv|wmv|mpg|mpeg|mkv|3gp|3g2|m2ts|vob|ogm|ogx|rm|rmvb|asf|amv|divx|m4v|svi|viv|f4v|f4p|f4a|f4b)',
    // audio
    '**/*.(mp3|wav|ogg|flac|aac|wma|alac|ape|ac3|dts|tta|opus|amr|aiff|au|mid|midi|ra|rm|wv|weba|dss|spx|vox|tak|dsf|dff|dsd|cda)',
    // font
    '**/*.(woff2?|eot|ttf|otf|ttc|pfa|pfb|pfm|afm)',
    // text
    '**/*.(json|json5|jsonc|txt|text|tsx|jsx|md|mdx|mdc|markdown|yaml|yml|toml)',
    // wasm
    '**/*.wasm',
  ], {
    cwd: config.root,
    onlyFiles: true,
    caseSensitiveMatch: false,
    ignore: [
      '**/node_modules/**',
      '**/dist/**',
      '**/package-lock.*',
      '**/pnpm-lock.*',
      '**/pnpm-workspace.*',
    ],
  })
  return await Promise.all(files.map(async (path) => {
    const filePath = resolve(config.root, path)
    const stat = await fs.lstat(filePath)
    path = path.startsWith('public/') ? path.slice(7) : path
    let base64 = ''
    // 假设我们只对小于10MB的文件进行Base64编码
    if (stat.size < 10 * 1024 * 1024) {
      const fileBuffer = await fs.readFile(filePath)
      base64 = `data:${guessMimeType(filePath)};base64,${fileBuffer.toString('base64')}`
    }
    return {
      path,
      filePath,
      publicPath: join(baseURL, path),
      type: guessType(path),
      size: stat.size,
      mtime: stat.mtimeMs,
      base64,
    }
  }))
}

const _imageMetaCache = new Map<string, ImageMeta | undefined>()
export async function getImageMeta(filepath: string) {
  if (_imageMetaCache.has(filepath))
    return _imageMetaCache.get(filepath)
  try {
    const meta = imageMeta(await fs.readFile(filepath)) as ImageMeta
    _imageMetaCache.set(filepath, meta)
    return meta
  }
  catch (e) {
    _imageMetaCache.set(filepath, undefined)
    console.error(e)
    return undefined
  }
}

export async function getTextAssetContent(filepath: string, limit = 300) {
  try {
    const content = await fs.readFile(filepath, 'utf-8')
    return content.slice(0, limit)
  }
  catch (e) {
    console.error(e)
    return undefined
  }
}
