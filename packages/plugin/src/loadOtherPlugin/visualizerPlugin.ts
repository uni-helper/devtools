import process from 'node:process'
import type { Plugin } from 'vite'
import Visualizer from 'rollup-plugin-visualizer'
import { DIR_TMP_VISUALIZER_NAME } from '../dir'

export function loadVisualizerPlugin() {
  // Disable visualizer in development to avoid template resolution issues
  if (process.env.NODE_ENV === 'development') {
    return {
      name: 'visualizer-noop',
      enforce: 'post',
    } as Plugin
  }

  return Visualizer({
    filename: DIR_TMP_VISUALIZER_NAME,
    template: 'treemap',
    gzipSize: true,
    brotliSize: true,
  }) as Plugin<any>
}
