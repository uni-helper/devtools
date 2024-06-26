import open from 'open'

export default async function openInBrowser(url: string) {
  await open(url)
}
