import type { Plugin } from 'vite'
import Visualizer from 'rollup-plugin-visualizer'
import { DIR_TMP_VISUALIZER_NAME } from '../dir'

export function loadVisualizerPlugin() {
  return Visualizer({
    filename: DIR_TMP_VISUALIZER_NAME,
    // @ts-expect-error 正则可以生效
    exclude: /node_modules/,
  }) as Plugin<any>
}
