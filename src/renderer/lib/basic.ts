// C64 BASIC V2 detokenizer. PRG files store a 2-byte load address, then
// lines of {next-line-ptr(2) | line-number(2) | tokens/PETSCII... | 0x00},
// terminated by a next-line-ptr of 0. Token bytes (>=0x80) are only tokens
// outside quoted strings; inside a REM, everything to the line end is text.
//
// PETSCII display is simplified: bytes 0x20-0x5F map 1:1 to ASCII (covers
// digits, uppercase letters, standard punctuation — the vast majority of
// real BASIC source). Bytes 0x61-0x7A are shown as lowercase for
// readability; genuine PETSCII shifted/graphics-mode nuances are not
// modelled. Anything else renders as a bracketed hex placeholder.

export interface Token {
  text: string
  cls?: string
}

const TOKENS: Record<number, string> = {
  0x80: 'END', 0x81: 'FOR', 0x82: 'NEXT', 0x83: 'DATA', 0x84: 'INPUT#',
  0x85: 'INPUT', 0x86: 'DIM', 0x87: 'READ', 0x88: 'LET', 0x89: 'GOTO',
  0x8a: 'RUN', 0x8b: 'IF', 0x8c: 'RESTORE', 0x8d: 'GOSUB', 0x8e: 'RETURN',
  0x8f: 'REM', 0x90: 'STOP', 0x91: 'ON', 0x92: 'WAIT', 0x93: 'LOAD',
  0x94: 'SAVE', 0x95: 'VERIFY', 0x96: 'DEF', 0x97: 'POKE', 0x98: 'PRINT#',
  0x99: 'PRINT', 0x9a: 'CONT', 0x9b: 'LIST', 0x9c: 'CLR', 0x9d: 'CMD',
  0x9e: 'SYS', 0x9f: 'OPEN', 0xa0: 'CLOSE', 0xa1: 'GET', 0xa2: 'NEW',
  0xa3: 'TAB(', 0xa4: 'TO', 0xa5: 'FN', 0xa6: 'SPC(', 0xa7: 'THEN',
  0xa8: 'NOT', 0xa9: 'STEP', 0xaa: '+', 0xab: '-', 0xac: '*', 0xad: '/',
  0xae: '^', 0xaf: 'AND', 0xb0: 'OR', 0xb1: '>', 0xb2: '=', 0xb3: '<',
  0xb4: 'SGN', 0xb5: 'INT', 0xb6: 'ABS', 0xb7: 'USR', 0xb8: 'FRE',
  0xb9: 'POS', 0xba: 'SQR', 0xbb: 'RND', 0xbc: 'LOG', 0xbd: 'EXP',
  0xbe: 'COS', 0xbf: 'SIN', 0xc0: 'TAN', 0xc1: 'ATN', 0xc2: 'PEEK',
  0xc3: 'LEN', 0xc4: 'STR$', 0xc5: 'VAL', 0xc6: 'ASC', 0xc7: 'CHR$',
  0xc8: 'LEFT$', 0xc9: 'RIGHT$', 0xca: 'MID$', 0xcb: 'GO', 0xff: 'π',
}

const REM_TOKEN = 0x8f

function petsciiChar(b: number): string {
  if (b >= 0x20 && b <= 0x5f) return String.fromCharCode(b)
  if (b >= 0x61 && b <= 0x7a) return String.fromCharCode(b)
  return `{$${b.toString(16).padStart(2, '0')}}`
}

export function detokenizeBasic(bytes: Uint8Array): Token[][] {
  const lines: Token[][] = []
  let pos = 2 // skip 2-byte load address
  while (pos + 1 < bytes.length && lines.length < 10000) {
    const nextPtr = bytes[pos] | (bytes[pos + 1] << 8)
    pos += 2
    if (nextPtr === 0) break
    const lineNo = bytes[pos] | (bytes[pos + 1] << 8)
    pos += 2
    const tokens: Token[] = [{ text: String(lineNo), cls: 'tok-num' }, { text: '  ' }]
    let inQuotes = false
    let inRem = false
    while (pos < bytes.length && bytes[pos] !== 0x00) {
      const b = bytes[pos]
      if (inRem) {
        tokens.push({ text: petsciiChar(b), cls: 'tok-cmt' })
      } else if (b === 0x22) {
        inQuotes = !inQuotes
        tokens.push({ text: '"', cls: 'tok-str' })
      } else if (!inQuotes && b >= 0x80) {
        const name = TOKENS[b] ?? `{$${b.toString(16).padStart(2, '0')}}`
        tokens.push({ text: name, cls: 'tok-kw' })
        if (b === REM_TOKEN) inRem = true
      } else if (inQuotes) {
        tokens.push({ text: petsciiChar(b), cls: 'tok-str' })
      } else {
        tokens.push({ text: petsciiChar(b) })
      }
      pos++
    }
    pos++ // skip 0x00 line terminator
    lines.push(tokens)
  }
  return lines
}
