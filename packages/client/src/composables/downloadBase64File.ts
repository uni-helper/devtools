export function downloadBase64File(base64Data: string, fileName: string) {
  const blob = base64ToBlob(base64Data)
  const a = document.createElement('a')
  a.style.display = 'none'
  const url = window.URL.createObjectURL(blob)
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  window.URL.revokeObjectURL(url)
}

function base64ToBlob(base64Data: string, contentType = '', sliceSize = 512) {
  const byteCharacters = atob(base64Data)
  const byteArrays = []

  for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
    const slice = byteCharacters.slice(offset, offset + sliceSize)

    const byteNumbers = Array.from({ length: slice.length })
    for (let i = 0; i < slice.length; i++) {
      byteNumbers[i] = slice.charCodeAt(i)
    }

    const byteArray = new Uint8Array(byteNumbers)
    byteArrays.push(byteArray)
  }

  const blob = new Blob(byteArrays, { type: contentType })
  return blob
}
