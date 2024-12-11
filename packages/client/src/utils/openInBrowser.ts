// @unocss-include
export async function openInBrowser(url: string) {
  if (getEnv() === 'h5') {
    window.open(url, '_blank')
  }
  else {
    const body = document.body
    body.classList.add('cursor-wait!')
    await trpc.openInBrowser.query(url)
    body.classList.remove('cursor-wait!')
  }
}
