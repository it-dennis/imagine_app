export function textToPetscii(text: string, length: number): Buffer {
  const buf = Buffer.alloc(length, 0xa0)
  const upper = text.toUpperCase().slice(0, length)
  for (let i = 0; i < upper.length; i++) {
    const code = upper.charCodeAt(i)
    buf[i] = code >= 0x20 && code <= 0x5f ? code : 0x3f
  }
  return buf
}

export function petsciiToText(bytes: Buffer | Uint8Array): string {
  let end = bytes.length
  while (end > 0 && bytes[end - 1] === 0xa0) end--
  let out = ''
  for (let i = 0; i < end; i++) {
    const b = bytes[i]
    out += b >= 0x20 && b <= 0x5f ? String.fromCharCode(b) : '?'
  }
  return out
}
