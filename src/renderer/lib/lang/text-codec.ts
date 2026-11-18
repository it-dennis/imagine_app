// Lossless byte <-> text mapping for the plain text editor: every byte becomes the character with the same
// code (Latin-1), so any file can be opened and saved without changing a byte it did not edit. Line
// separators are kept exactly as the file uses them.

export type Separator = '\n' | '\r\n' | '\r'

export function bytesToText(bytes: Uint8Array): string {
  let out = ''
  const CHUNK = 8192
  for (let i = 0; i < bytes.length; i += CHUNK) {
    out += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return out
}

export function detectSeparator(text: string, fallback: Separator = '\n'): Separator {
  if (text.includes('\r\n')) return '\r\n'
  if (text.includes('\n')) return '\n'
  if (text.includes('\r')) return '\r'
  return fallback
}

/** Default line ending for new files, matching what tools on that system expect. */
export function separatorFor(system: string): Separator {
  switch (system) {
    case 'c64':
    case 'vic20':
    case 'plus4':
    case 'c128':
      return '\r' // PETSCII carriage return
    case 'amiga':
      return '\n'
    default:
      return '\r\n' // DOS, Atari ST, MSX, CPC
  }
}

export interface Encoded {
  bytes?: Uint8Array
  /** Set when the text holds a character that is not a single byte (> U+00FF). */
  badChar?: { index: number; char: string }
}

export function textToBytes(text: string): Encoded {
  const bytes = new Uint8Array(text.length)
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    if (c > 0xff) return { badChar: { index: i, char: text[i] } }
    bytes[i] = c
  }
  return { bytes }
}
