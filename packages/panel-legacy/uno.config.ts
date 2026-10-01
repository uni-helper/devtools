import { mergeConfigs, presetWind } from 'unocss'
import { createDesignConfig } from '../../design/uno.config'

/**
 * The shared devframe design base (see `design/uno.config.ts`) plus this
 * panel's own extraction globs.
 *
 * Composed on `presetWind()` like every other iframe-served surface in this
 * repo. This SPA owns its whole document (it is served as the devframe's
 * `clientAssets` and rendered in a hub iframe, never into a shadow root), so
 * the shadow-root Wind3/Wind4 caveats in `design/uno.config.ts` do not apply
 * here — the base only has to match what `packages/hub-ui` and the other
 * surfaces already compile, so every panel keeps one visual language.
 */
export default mergeConfigs([
  createDesignConfig({ base: presetWind() }),
  {
    content: {
      pipeline: {
        // `@antfu/design` ships raw `.vue`/`.ts` source, and its components are
        // imported by full path — the default extension scan already reaches
        // them, but restating the include here keeps extraction identical to
        // `packages/hub-ui`'s config (setting `include` replaces the default
        // scan rather than extending it).
        include: [/\.vue($|\?)/, /\.ts$/],
      },
    },
  },
])
