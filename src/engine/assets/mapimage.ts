export async function loadImageWithProgress(
  url: string,
  onProgress?: (percent: number) => void
): Promise<ImageBitmap> {
  const res = await fetch(url)
  if (!res.ok) throw new Error('map_load_failed')

  const total = Number(res.headers.get('content-length'))
  if (!total) {
    // fallback
    const blob = await res.blob()
    return await createImageBitmap(blob)
  }

  const reader = res.body!.getReader()
  let loaded = 0
  const chunks: Uint8Array[] = []

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    loaded += value.length
    chunks.push(value)
    onProgress?.(Math.round((loaded / total) * 100))
  }

  // @ts-ignore
  const blob = new Blob(chunks)
  return await createImageBitmap(blob)
}

