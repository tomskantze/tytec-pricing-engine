export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename.replace(/[^\w.-]+/g, '_')
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export function downloadText(filename: string, type: string, text: string): void {
  downloadBlob(filename, new Blob([text], { type }))
}
