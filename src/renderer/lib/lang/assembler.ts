// 6502 assembler (documented opcodes only) with a deliberately small, fixed syntax.
//
// Accepted syntax (anything else is an error with a line number, never silently guessed):
//   comments        ; to the end of the line
//   labels          name:  (anywhere)  or  name  (first word at column 0)    @local  labels belong to the previous global label
//   constants       name = expression
//   program counter * = expression   .org expression   (also !org); "*" inside an expression is the current address
//   data            .byte/.by/.db a,b,"text"   .word/.wo/.dw a,b   .fill n[,value]   (the "!" form works too: !byte)
//   text            .text/.asc "ASCII"   .pet "PETSCII"   .scr "screen codes"
//   BASIC start     .basic            emits  10 SYS <address of the next byte>  at the program start (default $0801)
//   instructions    mnemonic operand   modes: implied, A, #imm, zp/abs, zp/abs,x  zp/abs,y  (zp,x)  (zp),y  (abs) for JMP
//   expressions     decimal, $hex, %binary, 0xhex, 'c', labels, *, ( ) + - * / % & | ^ << >>, unary - ~ < (low byte) > (high byte)
//   not supported   macros, includes, conditional assembly, anonymous (+/-) labels, undocumented opcodes
//
// Sizing is decided once, in the first pass, and kept: an operand whose value is not known yet (a forward
// reference) is assumed to be absolute even if it later turns out to fit in the zero page. That is deterministic
// and keeps every label address stable between the passes.

import { AsmError, MODE_SIZE, OPCODES, evaluate, type Ctx, type Mode, type Value } from './asm'

export interface AsmIssue {
  line: number
  message: string
}

export interface AsmResult {
  /** PRG file: two load-address bytes followed by the code. Absent when there are errors. */
  prg?: Uint8Array
  origin: number
  /** Address after the last byte. */
  end: number
  errors: AsmIssue[]
  warnings: AsmIssue[]
  symbols: Map<string, number>
  /** One entry per source line that produced bytes. */
  listing: { line: number; address: number; bytes: number[] }[]
}

// --- text helpers --------------------------------------------------------------------------------------

/** Removes a ;-comment that is not inside a string or a character literal. */
function stripComment(line: string): string {
  let inString = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (inString) {
      if (c === '\\') i++
      else if (c === '"') inString = false
      continue
    }
    if (c === '"') inString = true
    else if (c === "'" && line[i + 2] === "'") i += 2 // 'x' literal, e.g. ';' written as ';'
    else if (c === ';') return line.slice(0, i)
  }
  return line
}

/** Splits on commas outside quotes and parentheses. */
function splitArgs(text: string): string[] {
  const out: string[] = []
  let depth = 0
  let inString = false
  let cur = ''
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inString) {
      cur += c
      if (c === '\\' && i + 1 < text.length) cur += text[++i]
      else if (c === '"') inString = false
      continue
    }
    if (c === '"') inString = true
    else if (c === '(') depth++
    else if (c === ')') depth--
    else if (c === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue }
    cur += c
  }
  if (cur.trim() !== '' || out.length > 0) out.push(cur.trim())
  return out
}

const ascii = (s: string) => Array.from(s, (c) => c.charCodeAt(0) & 0xff)
const petscii = (s: string) => Array.from(s, (c) => {
  const code = c.charCodeAt(0)
  if (code >= 0x61 && code <= 0x7a) return code - 0x20 // a-z -> $41-$5A
  if (code >= 0x41 && code <= 0x5a) return code + 0x80 // A-Z -> $C1-$DA
  return code & 0xff
})
const screencode = (s: string) => Array.from(s, (c) => {
  const code = c.charCodeAt(0)
  if (code >= 0x61 && code <= 0x7a) return code - 0x60 // a-z -> 1-26
  if (code >= 0x40 && code <= 0x5f) return code - 0x40 // @, A-Z, [ \ ] ^ _ -> 0-31 (A-Z share 1-26 with a-z on the C64)
  return code & 0xff
})

/** The bytes of a "quoted" argument, or undefined when the argument is not a string. */
function stringBytes(arg: string, convert: (s: string) => number[]): number[] | undefined {
  const m = /^"((?:[^"\\]|\\.)*)"$/.exec(arg)
  if (!m) return undefined
  return convert(m[1].replace(/\\(.)/g, (_, c: string) => (c === 'n' ? '\n' : c)))
}

// --- operands ------------------------------------------------------------------------------------------

type Shape = 'imp' | 'acc' | 'imm' | 'izx' | 'izy' | 'ind' | 'addr' | 'addrx' | 'addry'

function shapeOf(mnemonic: string, operand: string): { shape: Shape; expr: string } {
  const op = operand.trim()
  if (op === '') return { shape: OPCODES[mnemonic].acc !== undefined && OPCODES[mnemonic].imp === undefined ? 'acc' : 'imp', expr: '' }
  if (/^a$/i.test(op) && OPCODES[mnemonic].acc !== undefined) return { shape: 'acc', expr: '' }
  if (op.startsWith('#')) return { shape: 'imm', expr: op.slice(1) }
  let m: RegExpExecArray | null
  if ((m = /^\((.*)\)\s*,\s*y$/i.exec(op))) return { shape: 'izy', expr: m[1] }
  if ((m = /^\((.*),\s*x\s*\)$/i.exec(op))) return { shape: 'izx', expr: m[1] }
  if (mnemonic === 'JMP' && (m = /^\((.*)\)$/.exec(op))) return { shape: 'ind', expr: m[1] }
  if ((m = /^(.*),\s*x$/i.exec(op))) return { shape: 'addrx', expr: m[1] }
  if ((m = /^(.*),\s*y$/i.exec(op))) return { shape: 'addry', expr: m[1] }
  return { shape: 'addr', expr: op }
}

const FIXED: Partial<Record<Shape, Mode>> = { imp: 'imp', acc: 'acc', imm: 'imm', izx: 'izx', izy: 'izy', ind: 'ind' }

/** Picks zero page or absolute for a plain/indexed address, given what is known about the value. */
function chooseAddressMode(mnemonic: string, shape: Shape, value: Value): Mode {
  const modes = OPCODES[mnemonic]
  if (modes.rel !== undefined) return 'rel'
  const suffix = shape === 'addrx' ? 'x' : shape === 'addry' ? 'y' : ''
  const zp = (suffix ? `zp${suffix}` : 'zp') as Mode
  const abs = (suffix ? `ab${suffix}` : 'abs') as Mode
  const fitsZp = value !== undefined && value >= 0 && value <= 0xff
  if (fitsZp && modes[zp] !== undefined) return zp
  if (modes[abs] !== undefined) return abs
  return modes[zp] !== undefined ? zp : abs
}

// --- the assembler -------------------------------------------------------------------------------------

type Phase = 'first' | 'settle' | 'final'

export function assemble(source: string, defaultOrigin = 0x0801): AsmResult {
  const lines = source.split(/\r\n|\r|\n/)
  const errors: AsmIssue[] = []
  const warnings: AsmIssue[] = []
  const symbols = new Map<string, number>()
  const plans = new Map<number, Mode>() // line index -> addressing mode decided in the first pass
  const out: number[] = []
  const listing: AsmResult['listing'] = []
  let origin: number | undefined
  let end = defaultOrigin

  const run = (phase: Phase) => {
    const ctx: Ctx = { symbols, pc: defaultOrigin, scope: '', lenient: phase !== 'final' }
    let pcSet = false
    let emitted = 0
    let outStart = 0
    const final = phase === 'final'
    if (final) { out.length = 0; listing.length = 0; origin = undefined }

    const ensurePc = () => { if (!pcSet) { ctx.pc = defaultOrigin; pcSet = true } }
    const put = (lineNo: number, bytes: number[]) => {
      ensurePc()
      if (final) {
        if (origin === undefined) { origin = ctx.pc; outStart = ctx.pc }
        const at = ctx.pc - outStart
        if (at < out.length) throw new AsmError('Die Adresse liegt vor bereits erzeugtem Code (zurückspringender Ursprung).')
        while (out.length < at) out.push(0) // a forward jump of the origin is padded with zeros
        out.push(...bytes)
        listing.push({ line: lineNo, address: ctx.pc, bytes })
      }
      ctx.pc += bytes.length
      emitted += bytes.length
      if (ctx.pc > 0x10000) throw new AsmError('Das Programm geht über $FFFF hinaus.')
    }
    const defineConstant = (name: string, expr: string) => {
      const v = evaluate(expr, ctx)
      const key = name.startsWith('@') ? `${ctx.scope}${name}` : name
      if (phase === 'first' && symbols.has(key)) throw new AsmError(`"${name}" ist doppelt definiert.`)
      if (v !== undefined) symbols.set(key, v)
      else if (final) throw new AsmError(`Der Wert von "${name}" ist nicht bestimmbar.`)
    }

    lines.forEach((raw, idx) => {
      const lineNo = idx + 1
      let text = stripComment(raw)
      if (text.trim() === '') return
      try {
        // A word at column 0 is a label, unless it is a mnemonic written without a colon.
        let label: string | null = null
        const col0 = /^(@?[A-Za-z_][A-Za-z0-9_]*)(:?)(?=\s|$|=)/.exec(text)
        const indented = /^\s+(@?[A-Za-z_][A-Za-z0-9_]*):(?!=)/.exec(text)
        if (col0 && (col0[2] === ':' || !OPCODES[col0[1].toUpperCase()])) {
          label = col0[1]
          text = text.slice(col0[0].length)
        } else if (indented) {
          label = indented[1]
          text = text.slice(indented[0].length)
        }
        const body = text.trim()

        if (label !== null && body.startsWith('=')) { defineConstant(label, body.slice(1)); return }
        if (label === null) {
          const star = /^\*\s*=\s*(.+)$/.exec(body)
          if (star) {
            const v = evaluate(star[1], ctx)
            if (v === undefined || v < 0 || v > 0xffff) throw new AsmError('Der Ursprung muss ein bekannter Wert zwischen $0000 und $FFFF sein.')
            ctx.pc = v
            pcSet = true
            return
          }
          const asg = /^(@?[A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/.exec(body)
          if (asg && !OPCODES[asg[1].toUpperCase()]) { defineConstant(asg[1], asg[2]); return }
        }

        if (label !== null) {
          if (!label.startsWith('@')) ctx.scope = label
          const key = label.startsWith('@') ? `${ctx.scope}${label}` : label
          ensurePc()
          if (phase === 'first') {
            if (symbols.has(key)) throw new AsmError(`Label "${label}" ist doppelt definiert.`)
            symbols.set(key, ctx.pc)
          } else if (symbols.get(key) !== ctx.pc) {
            throw new AsmError(`Label "${label}" ändert zwischen den Durchläufen seine Adresse (interner Fehler).`)
          }
        }
        if (body === '') return

        const dm = /^([.!]?[A-Za-z_][A-Za-z0-9_]*)\s*(.*)$/.exec(body)
        if (!dm) throw new AsmError(`Zeile nicht verständlich: "${body}".`)
        const word = dm[1]
        const rest = dm[2]
        const name = word.replace(/^[.!]/, '').toUpperCase()
        const isDirective = /^[.!]/.test(word)

        if (!isDirective) {
          if (!OPCODES[name]) throw new AsmError(`Unbekannter Befehl "${word}".`)
          const { shape, expr } = shapeOf(name, rest)
          const value = expr === '' ? undefined : evaluate(expr, ctx)
          const modes = OPCODES[name]
          const mode = plans.get(idx) ?? FIXED[shape] ?? chooseAddressMode(name, shape, value)
          if (phase === 'first') plans.set(idx, mode)
          const opcode = modes[mode]
          if (opcode === undefined) throw new AsmError(`${name} kennt die Adressierungsart "${rest.trim() || 'ohne Operand'}" nicht.`)
          const bytes = [opcode]
          const v = value ?? 0
          if (final && value === undefined && MODE_SIZE[mode] > 1) throw new AsmError('Der Operand ist nicht bestimmbar.')
          if (mode === 'rel') {
            const offset = v - (ctx.pc + 2)
            if (final && (offset < -128 || offset > 127)) throw new AsmError(`Sprung zu weit (${offset} Bytes, erlaubt sind -128 bis 127).`)
            bytes.push(offset & 0xff)
          } else if (MODE_SIZE[mode] === 2) {
            if (final && mode === 'imm' && (v < -128 || v > 255)) throw new AsmError(`Wert ${v} passt nicht in ein Byte.`)
            if (final && mode !== 'imm' && (v < 0 || v > 0xff)) throw new AsmError(`Adresse ${v} liegt nicht in der Zeropage.`)
            bytes.push(v & 0xff)
          } else if (MODE_SIZE[mode] === 3) {
            if (final && (v < 0 || v > 0xffff)) throw new AsmError(`Adresse ${v} liegt außerhalb von $0000 bis $FFFF.`)
            bytes.push(v & 0xff, (v >> 8) & 0xff)
          }
          put(lineNo, bytes)
          return
        }

        switch (name) {
          case 'ORG': {
            const v = evaluate(rest, ctx)
            if (v === undefined || v < 0 || v > 0xffff) throw new AsmError('Der Ursprung muss ein bekannter Wert zwischen $0000 und $FFFF sein.')
            ctx.pc = v
            pcSet = true
            return
          }
          case 'BYTE': case 'BY': case 'DB': case 'WORD': case 'WO': case 'DW': {
            const wide = name === 'WORD' || name === 'WO' || name === 'DW'
            const bytes: number[] = []
            for (const arg of splitArgs(rest)) {
              const str = wide ? undefined : stringBytes(arg, ascii)
              if (str) { bytes.push(...str); continue }
              const v = evaluate(arg, ctx)
              if (v === undefined) {
                if (final) throw new AsmError(`Der Wert "${arg}" ist nicht bestimmbar.`)
                bytes.push(...(wide ? [0, 0] : [0]))
              } else if (wide) {
                if (v < -32768 || v > 0xffff) throw new AsmError(`Wert ${v} passt nicht in ein Wort.`)
                bytes.push(v & 0xff, (v >> 8) & 0xff)
              } else {
                if (v < -128 || v > 255) throw new AsmError(`Wert ${v} passt nicht in ein Byte.`)
                bytes.push(v & 0xff)
              }
            }
            put(lineNo, bytes)
            return
          }
          case 'TEXT': case 'ASC': case 'PET': case 'SCR': {
            const convert = name === 'PET' ? petscii : name === 'SCR' ? screencode : ascii
            const bytes: number[] = []
            for (const arg of splitArgs(rest)) {
              const str = stringBytes(arg, convert)
              if (!str) throw new AsmError(`.${name.toLowerCase()} erwartet Zeichenketten in Anführungszeichen.`)
              bytes.push(...str)
            }
            put(lineNo, bytes)
            return
          }
          case 'FILL': case 'RES': {
            const [countText = '', valueText] = splitArgs(rest)
            const count = evaluate(countText, ctx)
            if (count === undefined || count < 0 || count > 0xffff) throw new AsmError('Die Anzahl muss ein bekannter Wert zwischen 0 und 65535 sein.')
            const value = valueText === undefined ? 0 : evaluate(valueText, ctx)
            put(lineNo, new Array<number>(count).fill((value ?? 0) & 0xff))
            return
          }
          case 'BASIC': {
            if (emitted > 0) throw new AsmError('.basic muss vor dem ersten Code stehen.')
            ensurePc()
            const start = ctx.pc
            let digits = 4
            for (let i = 0; i < 3; i++) digits = String(start + digits + 8).length
            const target = start + digits + 8
            // link, line number 10, SYS, address, end of line, end of program
            const bytes = [0, 0, 0x0a, 0x00, 0x9e, ...ascii(String(target)), 0, 0, 0]
            const next = start + bytes.length - 2
            bytes[0] = next & 0xff
            bytes[1] = (next >> 8) & 0xff
            put(lineNo, bytes)
            return
          }
          case 'INCLUDE': case 'MACRO': case 'ENDM': case 'IF': case 'IFDEF': case 'IFNDEF': case 'ELSE': case 'ENDIF': case 'IMPORT':
            throw new AsmError(`.${name.toLowerCase()} wird nicht unterstützt (keine Makros, Includes oder bedingte Assemblierung).`)
          default:
            throw new AsmError(`Unbekannte Direktive "${word}".`)
        }
      } catch (e) {
        if (e instanceof AsmError) errors.push({ line: lineNo, message: e.message })
        else throw e
      }
    })
    end = ctx.pc
  }

  run('first')
  // Constants that refer to labels further down need extra passes before the final one. All passes run even
  // after an error so that problems on other lines are reported together; a line already reported is not repeated.
  const reported = new Set(errors.map((e) => e.line))
  for (let i = 0; i < 3; i++) { const n = errors.length; run('settle'); errors.length = n }
  const before = errors.length
  run('final')
  const finalErrors = errors.splice(before).filter((e) => !reported.has(e.line))
  errors.push(...finalErrors)
  errors.sort((a, b) => a.line - b.line)
  const start = origin ?? defaultOrigin
  if (errors.length === 0 && out.length === 0) warnings.push({ line: 1, message: 'Das Programm enthält keinen Code.' })
  const prg = errors.length === 0 ? Uint8Array.from([start & 0xff, (start >> 8) & 0xff, ...out]) : undefined
  return { prg, origin: start, end, errors, warnings, symbols, listing }
}
