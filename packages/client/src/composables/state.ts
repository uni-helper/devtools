function clientStateFactory() {
  return {
    isFirstVisit: true,
    route: '/',
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
