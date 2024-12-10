// @unocss-include
export async function openInBrowser(url: string) {
  const body = document.body
  body.classList.add('cursor-wait')
  await trpc.openInBrowser.query(url)
  body.classList.remove('cursor-wait')
  // window.open(url, '_blank')
}
