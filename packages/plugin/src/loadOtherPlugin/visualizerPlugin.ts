import type { Plugin } from 'vite'
import Visualizer from 'rollup-plugin-visualizer'
import { DIR_TMP_VISUALIZER_NAME } from '../dir'

export function loadVisualizerPlugin() {
  return Visualizer({
    filename: DIR_TMP_VISUALIZER_NAME,
  }) as Plugin<any>
}
