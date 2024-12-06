function clientStateFactory() {
  return {
    isFirstVisit: true,
    route: '/',
    graphSettings: {
      node_modules: false,
      virtual: false,
      lib: false,
    },
  }
}

export const devtoolsClientState = useLocalStorage(
  '__UNI_DEVTOOLS_CLIENT_STATE__',
  clientStateFactory(),
  { mergeDefaults: true },
)

export function resetDevtoolsClientState() {
  devtoolsClientState.value = clientStateFactory()
}
