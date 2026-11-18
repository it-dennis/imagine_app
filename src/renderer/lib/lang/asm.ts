// 6502 opcode table and expression evaluator used by the assembler (see assembler.ts for the accepted syntax).

export type Mode = 'imp' | 'acc' | 'imm' | 'zp' | 'zpx' | 'zpy' | 'abs' | 'abx' | 'aby' | 'ind' | 'izx' | 'izy' | 'rel'

export const MODE_SIZE: Record<Mode, number> = {
  imp: 1, acc: 1, imm: 2, zp: 2, zpx: 2, zpy: 2, abs: 3, abx: 3, aby: 3, ind: 3, izx: 2, izy: 2, rel: 2,
}

/** mnemonic -> mode -> opcode. Written by hand; tests regenerate every entry from the aaabbbcc scheme. */
export const OPCODES: Record<string, Partial<Record<Mode, number>>> = {
  ADC: { imm: 0x69, zp: 0x65, zpx: 0x75, abs: 0x6d, abx: 0x7d, aby: 0x79, izx: 0x61, izy: 0x71 },
  AND: { imm: 0x29, zp: 0x25, zpx: 0x35, abs: 0x2d, abx: 0x3d, aby: 0x39, izx: 0x21, izy: 0x31 },
  ASL: { acc: 0x0a, zp: 0x06, zpx: 0x16, abs: 0x0e, abx: 0x1e },
  BCC: { rel: 0x90 }, BCS: { rel: 0xb0 }, BEQ: { rel: 0xf0 },
  BIT: { zp: 0x24, abs: 0x2c },
  BMI: { rel: 0x30 }, BNE: { rel: 0xd0 }, BPL: { rel: 0x10 },
  BRK: { imp: 0x00 }, BVC: { rel: 0x50 }, BVS: { rel: 0x70 },
  CLC: { imp: 0x18 }, CLD: { imp: 0xd8 }, CLI: { imp: 0x58 }, CLV: { imp: 0xb8 },
  CMP: { imm: 0xc9, zp: 0xc5, zpx: 0xd5, abs: 0xcd, abx: 0xdd, aby: 0xd9, izx: 0xc1, izy: 0xd1 },
  CPX: { imm: 0xe0, zp: 0xe4, abs: 0xec },
  CPY: { imm: 0xc0, zp: 0xc4, abs: 0xcc },
  DEC: { zp: 0xc6, zpx: 0xd6, abs: 0xce, abx: 0xde },
  DEX: { imp: 0xca }, DEY: { imp: 0x88 },
  EOR: { imm: 0x49, zp: 0x45, zpx: 0x55, abs: 0x4d, abx: 0x5d, aby: 0x59, izx: 0x41, izy: 0x51 },
  INC: { zp: 0xe6, zpx: 0xf6, abs: 0xee, abx: 0xfe },
  INX: { imp: 0xe8 }, INY: { imp: 0xc8 },
  JMP: { abs: 0x4c, ind: 0x6c },
  JSR: { abs: 0x20 },
  LDA: { imm: 0xa9, zp: 0xa5, zpx: 0xb5, abs: 0xad, abx: 0xbd, aby: 0xb9, izx: 0xa1, izy: 0xb1 },
  LDX: { imm: 0xa2, zp: 0xa6, zpy: 0xb6, abs: 0xae, aby: 0xbe },
  LDY: { imm: 0xa0, zp: 0xa4, zpx: 0xb4, abs: 0xac, abx: 0xbc },
  LSR: { acc: 0x4a, zp: 0x46, zpx: 0x56, abs: 0x4e, abx: 0x5e },
  NOP: { imp: 0xea },
  ORA: { imm: 0x09, zp: 0x05, zpx: 0x15, abs: 0x0d, abx: 0x1d, aby: 0x19, izx: 0x01, izy: 0x11 },
  PHA: { imp: 0x48 }, PHP: { imp: 0x08 }, PLA: { imp: 0x68 }, PLP: { imp: 0x28 },
  ROL: { acc: 0x2a, zp: 0x26, zpx: 0x36, abs: 0x2e, abx: 0x3e },
  ROR: { acc: 0x6a, zp: 0x66, zpx: 0x76, abs: 0x6e, abx: 0x7e },
  RTI: { imp: 0x40 }, RTS: { imp: 0x60 },
  SBC: { imm: 0xe9, zp: 0xe5, zpx: 0xf5, abs: 0xed, abx: 0xfd, aby: 0xf9, izx: 0xe1, izy: 0xf1 },
  SEC: { imp: 0x38 }, SED: { imp: 0xf8 }, SEI: { imp: 0x78 },
  STA: { zp: 0x85, zpx: 0x95, abs: 0x8d, abx: 0x9d, aby: 0x99, izx: 0x81, izy: 0x91 },
  STX: { zp: 0x86, zpy: 0x96, abs: 0x8e },
  STY: { zp: 0x84, zpx: 0x94, abs: 0x8c },
  TAX: { imp: 0xaa }, TAY: { imp: 0xa8 }, TSX: { imp: 0xba }, TXA: { imp: 0x8a }, TXS: { imp: 0x9a }, TYA: { imp: 0x98 },
}

// --- expressions ---------------------------------------------------------------------------------------

export class AsmError extends Error {}

export interface Ctx {
  symbols: Map<string, number>
  /** Address of the instruction or directive being assembled (the value of "*"). */
  pc: number
  /** Scope prefix for @local labels. */
  scope: string
  /** First pass: undefined symbols give `undefined` instead of an error. */
  lenient: boolean
}

export type Value = number | undefined

class ExprParser {
  private pos = 0
  constructor(private readonly src: string, private readonly ctx: Ctx) {}

  parseAll(): Value {
    const v = this.or()
    this.ws()
    if (this.pos < this.src.length) throw new AsmError(`Unerwartetes Zeichen "${this.src[this.pos]}" im Ausdruck "${this.src}".`)
    return v
  }

  private ws() { while (this.pos < this.src.length && /\s/.test(this.src[this.pos])) this.pos++ }
  private peek(s: string): boolean { this.ws(); return this.src.startsWith(s, this.pos) }
  private eat(s: string): boolean { if (this.peek(s)) { this.pos += s.length; return true } return false }

  private bin(next: () => Value, ops: [string, (a: number, b: number) => number][]): Value {
    let left = next()
    for (;;) {
      this.ws()
      const op = ops.find(([s]) => this.src.startsWith(s, this.pos) && !(s === '<' && this.src.startsWith('<<', this.pos)) && !(s === '>' && this.src.startsWith('>>', this.pos)))
      if (!op) return left
      this.pos += op[0].length
      const right = next()
      left = left === undefined || right === undefined ? undefined : op[1](left, right)
    }
  }

  private or = (): Value => this.bin(this.xor, [['|', (a, b) => a | b]])
  private xor = (): Value => this.bin(this.and, [['^', (a, b) => a ^ b]])
  private and = (): Value => this.bin(this.shift, [['&', (a, b) => a & b]])
  private shift = (): Value => this.bin(this.add, [['<<', (a, b) => a << b], ['>>', (a, b) => a >> b]])
  private add = (): Value => this.bin(this.mul, [['+', (a, b) => a + b], ['-', (a, b) => a - b]])
  private mul = (): Value => this.bin(this.unary, [
    ['*', (a, b) => a * b],
    ['/', (a, b) => { if (b === 0) throw new AsmError('Division durch null.'); return Math.trunc(a / b) }],
    ['%', (a, b) => { if (b === 0) throw new AsmError('Division durch null.'); return a % b }],
  ])

  private unary = (): Value => {
    this.ws()
    if (this.eat('-')) { const v = this.unary(); return v === undefined ? undefined : -v }
    if (this.eat('+')) return this.unary()
    if (this.eat('~')) { const v = this.unary(); return v === undefined ? undefined : ~v }
    if (this.eat('<')) { const v = this.unary(); return v === undefined ? undefined : v & 0xff }
    if (this.eat('>')) { const v = this.unary(); return v === undefined ? undefined : (v >> 8) & 0xff }
    return this.primary()
  }

  private primary(): Value {
    this.ws()
    const rest = this.src.slice(this.pos)
    let m: RegExpExecArray | null
    if (this.eat('(')) {
      const v = this.or()
      if (!this.eat(')')) throw new AsmError('Schließende Klammer fehlt.')
      return v
    }
    if ((m = /^\$([0-9a-fA-F]+)/.exec(rest))) { this.pos += m[0].length; return parseInt(m[1], 16) }
    if ((m = /^0x([0-9a-fA-F]+)/.exec(rest))) { this.pos += m[0].length; return parseInt(m[1], 16) }
    if ((m = /^%([01]+)/.exec(rest))) { this.pos += m[0].length; return parseInt(m[1], 2) }
    if ((m = /^\d+/.exec(rest))) { this.pos += m[0].length; return parseInt(m[0], 10) }
    if ((m = /^'(.)'/.exec(rest))) { this.pos += m[0].length; return m[1].charCodeAt(0) & 0xff }
    if (rest.startsWith('*')) { this.pos += 1; return this.ctx.pc }
    if ((m = /^@?[A-Za-z_][A-Za-z0-9_]*/.exec(rest))) {
      this.pos += m[0].length
      const name = m[0].startsWith('@') ? `${this.ctx.scope}${m[0]}` : m[0]
      const v = this.ctx.symbols.get(name)
      if (v === undefined && !this.ctx.lenient) throw new AsmError(`Unbekanntes Symbol "${m[0]}".`)
      return v
    }
    throw new AsmError(this.pos >= this.src.length ? 'Ausdruck unvollständig.' : `Unerwartetes Zeichen "${this.src[this.pos]}".`)
  }
}

export function evaluate(text: string, ctx: Ctx): Value {
  return new ExprParser(text, ctx).parseAll()
}

