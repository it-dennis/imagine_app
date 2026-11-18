// Lossless CBM BASIC codec (text <-> tokenized PRG) for V2, 3.5 and 7.0.
//
// Text form: one line per BASIC line, "<number> <body>". Bytes that have no plain ASCII form (colour and cursor
// codes, PETSCII graphics, unassigned tokens) are written as {name} or {$xx}, so that
//     tokenize(detokenize(prg)) == prg
// holds for ordinary programs. Programs where it does not hold (see checkRoundTrip) are opened read-only.
//
// Mirrors the ROM's crunch rules: keywords are recognised anywhere outside quotes (so TOTAL becomes TO + TAL,
// exactly like on the machine), text after REM is literal, text after DATA is literal up to the next colon
// outside quotes, and quotes switch tokenizing off until the closing quote or the end of the line.

import { DIALECT_DATA, type DialectData } from './basic-tokens'

export type DialectId = DialectData['id']

export interface Dialect {
  id: DialectId
  label: string
  loadAddress: number
  /** Keyword text by token bytes, e.g. "89" -> "GOTO", "ce04" -> "PEN". */
  names: Map<string, string>
  /** Lead bytes of two-byte tokens (0xCE, 0xFE on BASIC 7.0). */
  prefixes: Set<number>
  /** Keywords for matching: longest first, ties in table order (DOPEN must win over DO + PEN). */
  matchList: { text: string; upper: string; bytes: number[] }[]
  rem: number
  data: number
  print: number
}

const key = (bytes: number[]) => bytes.map((b) => b.toString(16).padStart(2, '0')).join('')

function buildDialect(d: DialectData): Dialect {
  const names = new Map<string, string>()
  const prefixes = new Set<number>()
  for (const t of d.tokens) {
    names.set(key(t.bytes), t.text) // later duplicates win, so the pi character is shown instead of "~"
    if (t.bytes.length === 2) prefixes.add(t.bytes[0])
  }
  const byText = (text: string) => d.tokens.find((t) => t.text === text)!.bytes[0]
  const matchList = d.tokens
    .map((t, i) => ({ ...t, i }))
    .sort((a, b) => b.text.length - a.text.length || a.i - b.i)
    .map(({ text, bytes }) => ({ text, upper: text.toUpperCase(), bytes }))
  return { id: d.id, label: d.label, loadAddress: d.loadAddress, names, prefixes, matchList, rem: byText('REM'), data: byText('DATA'), print: byText('PRINT') }
}

export const DIALECTS: Record<DialectId, Dialect> = {
  v2: buildDialect(DIALECT_DATA.v2),
  v35: buildDialect(DIALECT_DATA.v35),
  v70: buildDialect(DIALECT_DATA.v70),
}

/** Picks the dialect from the PRG load address (BASIC start). 0x1001 is shared by VIC-20 and Plus/4. */
export function guessDialect(loadAddress: number, system?: string): DialectId {
  if (loadAddress === 0x1c01) return 'v70'
  if (loadAddress === 0x0801) return 'v2'
  if (loadAddress === 0x1201) return 'v2' // VIC-20 with memory expansion
  if (loadAddress === 0x1001) return system === 'plus4' ? 'v35' : 'v2'
  return system === 'plus4' ? 'v35' : system === 'c128' ? 'v70' : 'v2'
}

// --- control-code names (cosmetic aliases for {$xx}) ---------------------------------------------------
const CODE_NAMES: Record<number, string> = {
  0x03: 'stop', 0x05: 'wht', 0x08: 'dish', 0x09: 'ensh', 0x0d: 'return', 0x0e: 'swlc', 0x11: 'down', 0x12: 'rvon',
  0x13: 'home', 0x14: 'del', 0x1b: 'esc', 0x1c: 'red', 0x1d: 'rght', 0x1e: 'grn', 0x1f: 'blu', 0x81: 'orng',
  0x85: 'f1', 0x86: 'f3', 0x87: 'f5', 0x88: 'f7', 0x89: 'f2', 0x8a: 'f4', 0x8b: 'f6', 0x8c: 'f8',
  0x8d: 'sret', 0x8e: 'swuc', 0x90: 'blk', 0x91: 'up', 0x92: 'rvof', 0x93: 'clr', 0x94: 'inst',
  0x95: 'brn', 0x96: 'lred', 0x97: 'gry1', 0x98: 'gry2', 0x99: 'lgrn', 0x9a: 'lblu', 0x9b: 'gry3',
  0x9c: 'pur', 0x9d: 'left', 0x9e: 'yel', 0x9f: 'cyn',
}
const NAME_CODES = new Map<string, number>(Object.entries(CODE_NAMES).map(([c, n]) => [n, Number(c)]))
// Spellings accepted on input in addition to the names above (the primary names match VICE's petcat).
for (const [alias, code] of [
  ['rvs on', 0x12], ['rvs off', 0x92], ['rvs', 0x12], ['right', 0x1d], ['lower', 0x0e], ['upper', 0x8e],
  ['shift return', 0x8d], ['cr', 0x0d], ['ret', 0x0d], ['clear', 0x93], ['black', 0x90], ['white', 0x05],
] as const) NAME_CODES.set(alias, code)

const hex2 = (b: number) => b.toString(16).padStart(2, '0')
const escape = (b: number) => (CODE_NAMES[b] ? `{${CODE_NAMES[b]}}` : `{$${hex2(b)}}`)

/** Plain PETSCII byte -> text for the range that is ASCII-compatible (0x20-0x5F). */
const isPlain = (b: number) => b >= 0x20 && b <= 0x5f

// --- detokenize ----------------------------------------------------------------------------------------

export interface Detokenized {
  text: string
  loadAddress: number
  /** Bytes after the end-of-program marker (usually machine code or nothing). */
  trailer: Uint8Array
  /** False when the line chain is cut off or damaged. */
  wellFormed: boolean
}

export function detokenize(prg: Uint8Array, d: Dialect): Detokenized {
  const loadAddress = prg.length >= 2 ? prg[0] | (prg[1] << 8) : d.loadAddress
  const lines: string[] = []
  let pos = 2
  let wellFormed = prg.length >= 2

  while (true) {
    if (pos + 2 > prg.length) { wellFormed = false; break }
    const link = prg[pos] | (prg[pos + 1] << 8)
    if (link === 0) { pos += 2; break }
    if (pos + 4 > prg.length) { wellFormed = false; break }
    const lineNo = prg[pos + 2] | (prg[pos + 3] << 8)
    let p = pos + 4
    let body = ''
    let inQuote = false
    let mode: 'normal' | 'rem' | 'data' = 'normal'
    const bodyStart = p
    while (p < prg.length && prg[p] !== 0) {
      const b = prg[p]
      const literal = inQuote || mode === 'rem' || mode === 'data'
      if (p === bodyStart && b === 0x20) {
        body += '{$20}' // a stored space right after the number would otherwise be swallowed as separator
        p++
        continue
      }
      if (!literal && b === 0x22) { inQuote = true; body += '"'; p++; continue }
      if (inQuote) {
        if (b === 0x22) { inQuote = false; body += '"' } else body += isPlain(b) ? String.fromCharCode(b) : escape(b)
        p++
        continue
      }
      if (mode === 'rem') { body += isPlain(b) ? String.fromCharCode(b) : escape(b); p++; continue }
      if (mode === 'data') {
        if (b === 0x22) { inQuote = true; body += '"' }
        else if (b === 0x3a) { mode = 'normal'; body += ':' }
        else body += isPlain(b) ? String.fromCharCode(b) : escape(b)
        p++
        continue
      }
      // normal mode
      if (b >= 0x80) {
        const two = d.prefixes.has(b) && p + 1 < prg.length ? d.names.get(key([b, prg[p + 1]])) : undefined
        const name = two ?? d.names.get(key([b]))
        if (two) { body += two; p += 2; continue }
        if (name && !d.prefixes.has(b)) {
          body += name
          if (b === d.rem) mode = 'rem'
          else if (b === d.data) mode = 'data'
          p++
          continue
        }
        body += `{$${hex2(b)}}`
        p++
        continue
      }
      body += isPlain(b) ? String.fromCharCode(b) : escape(b)
      p++
    }
    if (p >= prg.length) wellFormed = false // line without terminating zero
    lines.push(body === '' ? `${lineNo}` : `${lineNo} ${body}`)
    pos = p + 1
  }

  return { text: lines.join('\n'), loadAddress, trailer: prg.slice(wellFormed ? pos : prg.length), wellFormed }
}

// --- tokenize ------------------------------------------------------------------------------------------

export interface LineIssue {
  /** 1-based line in the text. */
  line: number
  message: string
}

export interface Tokenized {
  prg: Uint8Array
  errors: LineIssue[]
  warnings: LineIssue[]
}

function charToByte(ch: string): number | undefined {
  const code = ch.charCodeAt(0)
  if (code >= 0x20 && code <= 0x5f) return code
  if (code >= 0x61 && code <= 0x7a) return code - 0x20 // typed lowercase means the same PETSCII letter
  if (ch === '£') return 0x5c // pound sign
  if (ch === '↑') return 0x5e // up arrow
  if (ch === '←') return 0x5f // left arrow
  return undefined
}

export function tokenize(text: string, d: Dialect, loadAddress: number = d.loadAddress): Tokenized {
  const errors: LineIssue[] = []
  const warnings: LineIssue[] = []
  const lines: { no: number; body: number[] }[] = []
  let lastNo = -1

  text.split(/\r\n|\r|\n/).forEach((raw, idx) => {
    const line = idx + 1
    if (raw.trim() === '') return
    const m = /^\s*(\d+)(.*)$/.exec(raw)
    if (!m) { errors.push({ line, message: 'Zeile muss mit einer Zeilennummer beginnen.' }); return }
    const no = Number(m[1])
    if (no > 63999) { errors.push({ line, message: `Zeilennummer ${no} ist größer als 63999.` }); return }
    if (no <= lastNo) warnings.push({ line, message: `Zeilennummer ${no} ist nicht größer als die vorherige.` })
    lastNo = no

    const rest = m[2].replace(/^ +/, '') // like the ROM: spaces after the number are not stored
    const body: number[] = []
    let inQuote = false
    let mode: 'normal' | 'rem' | 'data' = 'normal'
    let i = 0
    let bad = false

    while (i < rest.length) {
      const ch = rest[i]
      if (ch === '{') {
        const end = rest.indexOf('}', i)
        const name = end < 0 ? '' : rest.slice(i + 1, end)
        const hexMatch = /^\$([0-9a-fA-F]{1,2})$/.exec(name)
        const code = hexMatch ? parseInt(hexMatch[1], 16) : NAME_CODES.get(name.toLowerCase())
        if (code === undefined) { errors.push({ line, message: `Unbekannter Ausdruck ${end < 0 ? '"{"' : `{${name}}`}.` }); bad = true; break }
        body.push(code)
        i = end + 1
        continue
      }
      const literal = inQuote || mode !== 'normal'
      if (!literal && ch === '"') { inQuote = true; body.push(0x22); i++; continue }
      if (inQuote) {
        if (ch === '"') inQuote = false
        const b = charToByte(ch)
        if (b === undefined) { errors.push({ line, message: `Zeichen "${ch}" ist in PETSCII nicht darstellbar; nutze {$xx}.` }); bad = true; break }
        body.push(b)
        i++
        continue
      }
      if (mode === 'rem' || mode === 'data') {
        if (mode === 'data' && ch === '"') { inQuote = true; body.push(0x22); i++; continue }
        if (mode === 'data' && ch === ':') mode = 'normal'
        const b = charToByte(ch)
        if (b === undefined) { errors.push({ line, message: `Zeichen "${ch}" ist in PETSCII nicht darstellbar; nutze {$xx}.` }); bad = true; break }
        body.push(b)
        i++
        continue
      }
      // normal mode: keyword, or a plain character
      const upper = rest.slice(i).toUpperCase()
      const hit = d.matchList.find((t) => upper.startsWith(t.upper))
      if (hit) {
        body.push(...hit.bytes)
        i += hit.text.length
        if (hit.bytes.length === 1 && hit.bytes[0] === d.rem) mode = 'rem'
        else if (hit.bytes.length === 1 && hit.bytes[0] === d.data) mode = 'data'
        continue
      }
      if (ch === '?') { body.push(d.print); i++; continue }
      const b = charToByte(ch)
      if (b === undefined) { errors.push({ line, message: `Zeichen "${ch}" ist in PETSCII nicht darstellbar; nutze {$xx}.` }); bad = true; break }
      body.push(b)
      i++
    }
    if (bad) return
    // Programs made by tools can have long lines; the C64 editor only cannot enter more than ~255 bytes.
    if (body.length > 255) warnings.push({ line, message: `Zeile ${no} ist ${body.length} Bytes lang; der C64-Editor nimmt höchstens etwa 255 an.` })
    lines.push({ no, body })
  })

  const out: number[] = [loadAddress & 0xff, (loadAddress >> 8) & 0xff]
  let addr = loadAddress
  for (const l of lines) {
    const next = addr + 4 + l.body.length + 1
    out.push(next & 0xff, (next >> 8) & 0xff, l.no & 0xff, (l.no >> 8) & 0xff, ...l.body, 0)
    addr = next
  }
  out.push(0, 0)
  if (addr + 2 > 0xffff) errors.push({ line: 1, message: 'Das Programm ist zu groß für den BASIC-Speicher.' })
  return { prg: Uint8Array.from(out), errors, warnings }
}

// --- safety check before opening for editing -----------------------------------------------------------

export interface RoundTrip {
  text: string
  loadAddress: number
  /** Present when the file is not editable as plain BASIC text; the reason is shown to the user. */
  problem?: 'malformed' | 'trailer' | 'not-lossless'
  trailerBytes: number
}

/**
 * Detokenizes and re-tokenizes. Editing is only offered when the result is byte-identical, because saving
 * regenerates the whole file from the text.
 */
export function checkRoundTrip(prg: Uint8Array, d: Dialect): RoundTrip {
  const det = detokenize(prg, d)
  const base = { text: det.text, loadAddress: det.loadAddress, trailerBytes: det.trailer.length }
  if (!det.wellFormed) return { ...base, problem: 'malformed' }
  if (det.trailer.length > 0) return { ...base, problem: 'trailer' }
  const back = tokenize(det.text, d, det.loadAddress)
  const same = back.errors.length === 0 && back.prg.length === prg.length && back.prg.every((b, i) => b === prg[i])
  return same ? base : { ...base, problem: 'not-lossless' }
}
