import fs from 'node:fs/promises'
import fg from 'fast-glob'
import { join, resolve } from 'pathe'
import type { ResolvedConfig } from 'vite'
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
    return {
      path,
      filePath,
      publicPath: join(baseURL, path),
      type: guessType(path),
      size: stat.size,
      mtime: stat.mtimeMs,
    }
  }))
}
