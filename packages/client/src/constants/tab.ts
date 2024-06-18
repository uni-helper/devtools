// @unocss-include
export const builtinTab = [
  [
    'app',
    [
      {
        icon: 'i-carbon-information',
        name: 'overview',
        order: -100,
        path: '/overview',
        title: 'Overview',
      },
      {
        icon: 'i-carbon-assembly-cluster',
        name: 'components',
        order: -100,
        path: '/components',
        title: 'Components',
      },
      {
        icon: 'i-carbon-tree-view-alt',
        name: 'pages',
        order: -100,
        path: '/pages',
        title: 'Pages',
      },
      {
        icon: 'i-carbon-image-copy',
        name: 'assets',
        order: -100,
        path: '/assets',
        title: 'Assets',
      },
    ],
  ],
  [
    'modules',
    [
      {
        icon: 'i-logos-pinia',
        name: 'pinia',
        order: -100,
        path: '/pinia',
        title: 'Pinia',
      },
    ],
  ],
  [
    'advanced',
    [
      {
        icon: 'i-carbon-network-4',
        name: 'graph',
        order: -100,
        path: '/graph',
        title: 'Graph',
      },
      {
        icon: 'i-carbon-ibm-watson-discovery',
        name: 'inspect',
        order: -100,
        path: '/inspect',
        title: 'Inspect',
      },
    ],
  ],
]

export type BuiltinTab = typeof builtinTab[number][number][number]
export type Tab = Exclude<BuiltinTab, string>
