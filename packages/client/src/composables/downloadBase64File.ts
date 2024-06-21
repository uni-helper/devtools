export function downloadBase64File(base64Data: string, fileName: string) {
  // 将base64字符串转换为Blob对象
  const blob = base64ToBlob(base64Data)
  // 创建一个隐藏的a标签
  const a = document.createElement('a')
  a.style.display = 'none'
  // 利用URL.createObjectURL创建Blob的url
  const url = window.URL.createObjectURL(blob)
  a.href = url
  // 设置下载文件的名称
  a.download = fileName
  // 将a标签添加到body中，并触发点击事件
  document.body.appendChild(a)
  a.click()
  // 清理并移除a标签
  document.body.removeChild(a)
  window.URL.revokeObjectURL(url)
}

function base64ToBlob(base64Data: string, contentType = '', sliceSize = 512) {
  // 使用atob函数解码base64字符串
  const byteCharacters = atob(base64Data)
  const byteArrays = []

  // 切割字符串
  for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
    const slice = byteCharacters.slice(offset, offset + sliceSize)

    const byteNumbers = Array.from({ length: slice.length })
    for (let i = 0; i < slice.length; i++) {
      byteNumbers[i] = slice.charCodeAt(i)
    }

    const byteArray = new Uint8Array(byteNumbers)
    byteArrays.push(byteArray)
  }

  // 使用Blob构造函数创建Blob对象
  const blob = new Blob(byteArrays, { type: contentType })
  return blob
}
