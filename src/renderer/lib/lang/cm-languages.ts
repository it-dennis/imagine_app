import { StreamLanguage, type StreamParser, type StringStream } from '@codemirror/language'
import { DIALECTS, type Dialect, type DialectId } from './basic'

// Syntax colouring for the editor. The BASIC parser follows the same state machine as the tokenizer
// (quotes, REM, DATA), so what is coloured as a keyword is what will really be tokenized.

interface BasicState {
  inQuote: boolean
  mode: 'normal' | 'rem' | 'data'
}

function basicParser(d: Dialect): StreamParser<BasicState> {
  return {
    name: `cbm-basic-${d.id}`,
    startState: () => ({ inQuote: false, mode: 'normal' }),
    token(stream, state) {
      const start = stream.pos
      const style = basicToken(stream, state, d)
      if (stream.pos === start) stream.next() // a parser that does not advance throws inside CodeMirror
      return style
    },
  }
}

function basicToken(stream: StringStream, state: BasicState, d: Dialect): string | null {
  {
    {
      if (stream.sol()) {
        state.inQuote = false
        state.mode = 'normal'
        if (stream.match(/^\s*\d+/)) return 'atom' // line number
      }
      if (stream.eatSpace()) return null
      if (stream.match(/^\{[^}]*\}/)) return 'meta' // {clr}, {$93}
      if (state.inQuote) {
        if (stream.eat('"')) { state.inQuote = false; return 'string' }
        while (!stream.eol() && stream.peek() !== '"' && stream.peek() !== '{') stream.next()
        return 'string'
      }
      if (state.mode === 'rem') {
        while (!stream.eol() && stream.peek() !== '{') stream.next()
        return 'comment'
      }
      if (state.mode === 'data') {
        if (stream.eat('"')) { state.inQuote = true; return 'string' }
        if (stream.eat(':')) { state.mode = 'normal'; return 'operator' }
        while (!stream.eol() && !/["{:]/.test(stream.peek() ?? '')) stream.next()
        return 'number'
      }
      if (stream.eat('"')) { state.inQuote = true; return 'string' }
      const rest = stream.string.slice(stream.pos).toUpperCase()
      const hit = d.matchList.find((t) => rest.startsWith(t.upper))
      if (hit) {
        stream.pos += hit.text.length
        if (hit.bytes.length === 1 && hit.bytes[0] === d.rem) state.mode = 'rem'
        else if (hit.bytes.length === 1 && hit.bytes[0] === d.data) state.mode = 'data'
        return /^[A-Zπ]/.test(hit.text) ? 'keyword' : 'operator'
      }
      if (stream.match(/^\d+\.?\d*(E[+-]?\d+)?/i)) return 'number'
      stream.next()
      return null
    }
  }
}

const basicLanguages = new Map<DialectId, StreamLanguage<BasicState>>()
export function basicLanguage(id: DialectId): StreamLanguage<BasicState> {
  let lang = basicLanguages.get(id)
  if (!lang) {
    lang = StreamLanguage.define(basicParser(DIALECTS[id]))
    basicLanguages.set(id, lang)
  }
  return lang
}

/** The 56 documented 6502 mnemonics. */
export const MNEMONICS = new Set(
  ('ADC AND ASL BCC BCS BEQ BIT BMI BNE BPL BRK BVC BVS CLC CLD CLI CLV CMP CPX CPY DEC DEX DEY EOR INC INX INY JMP JSR ' +
    'LDA LDX LDY LSR NOP ORA PHA PHP PLA PLP ROL ROR RTI RTS SBC SEC SED SEI STA STX STY TAX TAY TSX TXA TXS TYA').split(' '),
)

const asmParser: StreamParser<{ lineStart: boolean }> = {
  name: 'asm6502',
  startState: () => ({ lineStart: true }),
  token(stream, state) {
    const start = stream.pos
    const style = asmToken(stream, state)
    if (stream.pos === start) stream.next()
    return style
  },
}

function asmToken(stream: StringStream, state: { lineStart: boolean }): string | null {
  {
    if (stream.sol()) state.lineStart = true
    if (stream.eatSpace()) return null
    if (stream.eat(';')) { stream.skipToEnd(); return 'comment' }
    if (stream.match(/^"(?:[^"\\]|\\.)*"?/) || stream.match(/^'(?:[^'\\]|\\.)*'?/)) { state.lineStart = false; return 'string' }
    if (stream.match(/^\$[0-9a-fA-F]+|^%[01]+|^\d+/)) { state.lineStart = false; return 'number' }
    if (stream.match(/^[.!][A-Za-z_]\w*/) || stream.match(/^\*\s*=/)) { state.lineStart = false; return 'meta' }
    const word = stream.match(/^[A-Za-z_][\w.]*:?/) as RegExpMatchArray | null
    if (word) {
      const text = word[0].replace(/:$/, '')
      const atStart = state.lineStart
      state.lineStart = false
      if (MNEMONICS.has(text.toUpperCase()) && !(atStart && word[0].endsWith(':'))) return 'keyword'
      if (atStart || word[0].endsWith(':')) return 'labelName'
      return 'variableName'
    }
    stream.next()
    state.lineStart = false
    return 'operator'
  }
}

export const asmLanguage = StreamLanguage.define(asmParser)
