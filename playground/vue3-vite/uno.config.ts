import {
  defineConfig,
  presetIcons,
  transformerDirectives,
  transformerVariantGroup,
} from 'unocss'

import { presetUni } from '@uni-helper/unocss-preset-uni'

export default defineConfig({
  // 场景页共用的几种块，页面里只写结构不堆样式
  shortcuts: {
    'page': 'min-h-screen bg-gray-100 p-3 pb-12 text-sm text-gray-800',
    'card': 'mb-3 rounded-lg bg-white p-3',
    'card-title': 'mb-2 font-bold text-gray-700',
    'kv': 'font-mono text-xs text-gray-600 leading-5',
    'btn': 'mb-2 mr-2 inline-block rounded bg-teal-600 px-3 py-1 text-xs text-white',
  },
  presets: [
    presetUni(),
    presetIcons({
      scale: 1.2,
      warn: true,
      extraProperties: {
        'display': 'inline-block',
        'vertical-align': 'middle',
      },
    }),
  ],
  transformers: [
    transformerDirectives(),
    transformerVariantGroup(),
  ],
})
