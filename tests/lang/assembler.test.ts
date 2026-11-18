import { describe, it, expect } from 'vitest'
import { assemble } from '../../src/renderer/lib/lang/assembler'
import { MODE_SIZE, OPCODES, type Mode } from '../../src/renderer/lib/lang/asm'
import { disassemble6502 } from '../../src/renderer/lib/disassembler'

const hex = (a?: Uint8Array) => (a ? Buffer.from(a).toString('hex') : '(none)')
const asm = (src: string, origin?: number) => assemble(src, origin)
/** Assembles and returns only the code bytes (without the 2-byte load address). */
const code = (src: string, origin?: number) => {
  const r = asm(src, origin)
  expect(r.errors, JSON.stringify(r.errors)).toEqual([])
  return Array.from(r.prg!.subarray(2))
}

// ---------------------------------------------------------------------------------------------------
// The 151 documented opcodes, generated from the 6502's own bit pattern (aaabbbcc) and the branch rule,
// independently of the hand-written table in asm.ts and of the disassembler's table.
// ---------------------------------------------------------------------------------------------------
type Entry = { mnemonic: string; mode: Mode }
function generateOpcodes(): Map<number, Entry> {
  const map = new Map<number, Entry>()
  const add = (op: number, mnemonic: string, mode: Mode) => {
    expect(map.has(op), `duplicate generated opcode ${op.toString(16)}`).toBe(false)
    map.set(op, { mnemonic, mode })
  }
  // cc = 01: ORA AND EOR ADC STA LDA CMP SBC   modes by bbb: (zp,x) zp #imm abs (zp),y zp,x abs,y abs,x
  const g1 = ['ORA', 'AND', 'EOR', 'ADC', 'STA', 'LDA', 'CMP', 'SBC']
  const m1: Mode[] = ['izx', 'zp', 'imm', 'abs', 'izy', 'zpx', 'aby', 'abx']
  g1.forEach((name, a) => m1.forEach((mode, b) => { if (!(name === 'STA' && mode === 'imm')) add((a << 5) | (b << 2) | 1, name, mode) }))
  // cc = 10: ASL ROL LSR ROR STX LDX DEC INC
  const g2 = ['ASL', 'ROL', 'LSR', 'ROR', 'STX', 'LDX', 'DEC', 'INC']
  const m2: (Mode | null)[] = ['imm', 'zp', 'acc', 'abs', null, 'zpx', null, 'abx']
  g2.forEach((name, a) => m2.forEach((mode, b) => {
    if (!mode) return
    if (mode === 'imm' && name !== 'LDX') return
    if (mode === 'acc' && a > 3) return // only the four shifts have an accumulator form
    let m: Mode = mode
    if (name === 'STX' || name === 'LDX') { if (mode === 'zpx') m = 'zpy'; if (mode === 'abx') m = 'aby' }
    if (name === 'STX' && m === 'aby') return // STX has no abs,Y
    if ((name === 'DEC' || name === 'INC') && (mode === 'imm' || mode === 'acc')) return
    add((a << 5) | (b << 2) | 2, name, m)
  }))
  // cc = 00: BIT JMP JMP(ind) STY LDY CPY CPX   (aaa = 1..7)
  const g0: [number, string, Mode, number][] = [
    [1, 'BIT', 'zp', 1], [1, 'BIT', 'abs', 3],
    [2, 'JMP', 'abs', 3], [3, 'JMP', 'ind', 3],
    [4, 'STY', 'zp', 1], [4, 'STY', 'abs', 3], [4, 'STY', 'zpx', 5],
    [5, 'LDY', 'imm', 0], [5, 'LDY', 'zp', 1], [5, 'LDY', 'abs', 3], [5, 'LDY', 'zpx', 5], [5, 'LDY', 'abx', 7],
    [6, 'CPY', 'imm', 0], [6, 'CPY', 'zp', 1], [6, 'CPY', 'abs', 3],
    [7, 'CPX', 'imm', 0], [7, 'CPX', 'zp', 1], [7, 'CPX', 'abs', 3],
  ]
  for (const [a, name, mode, b] of g0) add((a << 5) | (b << 2), name, mode)
  // branches: xxy10000 — flag xx (N V C Z), y = value tested
  const flags = [['BPL', 'BMI'], ['BVC', 'BVS'], ['BCC', 'BCS'], ['BNE', 'BEQ']]
  flags.forEach(([clear, set], i) => { add((i << 6) | 0x10, clear, 'rel'); add((i << 6) | 0x30, set, 'rel') })
  // implied, stack and the rest, by their well-known encodings
  const implied: [number, string, Mode][] = [
    [0x00, 'BRK', 'imp'], [0x20, 'JSR', 'abs'], [0x40, 'RTI', 'imp'], [0x60, 'RTS', 'imp'],
    [0x08, 'PHP', 'imp'], [0x28, 'PLP', 'imp'], [0x48, 'PHA', 'imp'], [0x68, 'PLA', 'imp'],
    [0x88, 'DEY', 'imp'], [0xa8, 'TAY', 'imp'], [0xc8, 'INY', 'imp'], [0xe8, 'INX', 'imp'],
    [0x18, 'CLC', 'imp'], [0x38, 'SEC', 'imp'], [0x58, 'CLI', 'imp'], [0x78, 'SEI', 'imp'],
    [0x98, 'TYA', 'imp'], [0xb8, 'CLV', 'imp'], [0xd8, 'CLD', 'imp'], [0xf8, 'SED', 'imp'],
    [0x8a, 'TXA', 'imp'], [0x9a, 'TXS', 'imp'], [0xaa, 'TAX', 'imp'], [0xba, 'TSX', 'imp'],
    [0xca, 'DEX', 'imp'], [0xea, 'NOP', 'imp'],
  ]
  for (const [op, name, mode] of implied) add(op, name, mode)
  return map
}

describe('opcode tables', () => {
  const generated = generateOpcodes()

  it('the generator finds exactly the 151 documented opcodes', () => {
    expect(generated.size).toBe(151)
  })

  it('the assembler table equals the generated one, entry for entry', () => {
    const fromTable = new Map<number, Entry>()
    for (const [mnemonic, modes] of Object.entries(OPCODES)) {
      for (const [mode, opcode] of Object.entries(modes)) fromTable.set(opcode!, { mnemonic, mode: mode as Mode })
    }
    expect(fromTable.size).toBe(151)
    for (const [op, entry] of generated) expect(fromTable.get(op), `opcode ${op.toString(16)}`).toEqual(entry)
  })

  it('the disassembler agrees on mnemonic and length for all 256 byte values', () => {
    for (let op = 0; op < 256; op++) {
      const [line] = disassemble6502(Uint8Array.from([0x00, 0x10, op, 0x34, 0x12]))
      const mnemonic = line.find((t) => t.cls === 'tok-fn' || t.text === '.byte')!.text
      const entry = generated.get(op)
      if (!entry) { expect(mnemonic, `illegal ${op.toString(16)}`).toBe('.byte'); continue }
      expect(mnemonic, `opcode ${op.toString(16)}`).toBe(entry.mnemonic)
      const bytes = line.find((t) => t.cls === 'tok-num')!.text.trim().split(' ').length
      expect(bytes, `length of ${op.toString(16)}`).toBe(MODE_SIZE[entry.mode])
    }
  })
})

describe('instructions', () => {
  it('assembles every addressing mode to the expected bytes', () => {
    expect(code('lda #$12')).toEqual([0xa9, 0x12])
    expect(code('lda $12')).toEqual([0xa5, 0x12])
    expect(code('lda $1234')).toEqual([0xad, 0x34, 0x12])
    expect(code('lda $12,x')).toEqual([0xb5, 0x12])
    expect(code('lda $1234,x')).toEqual([0xbd, 0x34, 0x12])
    expect(code('lda $1234,y')).toEqual([0xb9, 0x34, 0x12])
    expect(code('lda ($12,x)')).toEqual([0xa1, 0x12])
    expect(code('lda ($12),y')).toEqual([0xb1, 0x12])
    expect(code('jmp ($1234)')).toEqual([0x6c, 0x34, 0x12])
    expect(code('asl a')).toEqual([0x0a])
    expect(code('asl')).toEqual([0x0a])
    expect(code('asl $d020')).toEqual([0x0e, 0x20, 0xd0])
    expect(code('ldx $12,y')).toEqual([0xb6, 0x12])
    expect(code('stx $12,y')).toEqual([0x96, 0x12])
    expect(code('rts')).toEqual([0x60])
  })

  it('is case-insensitive for mnemonics and registers but not for labels', () => {
    expect(code('LDA #1\nSta $D020,X')).toEqual([0xa9, 0x01, 0x9d, 0x20, 0xd0])
    expect(asm('Foo: nop\n jmp foo').errors[0].message).toMatch(/Unbekanntes Symbol/)
  })

  it('branches are relative and checked for range', () => {
    expect(code('* = $1000\nloop: dex\n bne loop')).toEqual([0xca, 0xd0, 0xfd])
    expect(code('* = $1000\n beq skip\n nop\nskip: rts')).toEqual([0xf0, 0x01, 0xea, 0x60])
    const far = asm('* = $1000\n bne far\n .fill 200\nfar: rts')
    expect(far.errors[0].message).toMatch(/Sprung zu weit/)
    expect(code('* = $1000\n .fill 126\n loop: nop\n .fill 125\n bne loop').slice(-2)).toEqual([0xd0, 0x80]) // -128 is the limit
  })

  it('rejects operands an instruction cannot take', () => {
    expect(asm('sta #1').errors[0].message).toMatch(/kennt/)
    expect(asm('inx 5').errors[0].message).toMatch(/kennt/)
    expect(asm('lda ($12,y)').errors).toHaveLength(1)
    expect(asm(' xyz #1').errors[0].message).toMatch(/Unbekannter Befehl/)
    expect(asm('lda #300').errors[0].message).toMatch(/passt nicht in ein Byte/)
    expect(asm('ldx $1234,y\n stx $1234,y').errors[0].line).toBe(2) // STX has no absolute,Y
  })
})

describe('zero page versus absolute', () => {
  it('uses zero page for known small values and absolute otherwise', () => {
    expect(code('v = $fb\n lda v')).toEqual([0xa5, 0xfb])
    expect(code('v = $0400\n lda v')).toEqual([0xad, 0x00, 0x04])
    expect(code('lda $00ff')).toEqual([0xa5, 0xff])
  })

  it('treats a forward reference as absolute even if it turns out to fit in zero page, consistently', () => {
    const src = '* = $0800\n lda tmp\n lda tmp2\nmark: rts\ntmp = $10\ntmp2 = mark - $0800'
    const r = asm(src)
    expect(r.errors).toEqual([])
    // both operands were unknown in pass 1, so both are absolute (3 bytes), and `mark` sits after 3+3 bytes
    expect(Array.from(r.prg!.subarray(2))).toEqual([0xad, 0x10, 0x00, 0xad, 0x06, 0x00, 0x60])
    expect(r.symbols.get('mark')).toBe(0x0806)
  })

  it('constants that refer to later labels resolve', () => {
    const r = asm('* = $2000\n sta end_marker\n nop\nend_marker: rts')
    expect(r.errors).toEqual([])
    expect(r.symbols.get('end_marker')).toBe(0x2004)
  })
})

describe('expressions', () => {
  it('distinguishes * as the program counter from multiplication', () => {
    expect(code('* = $1000\n lda #<*\n lda #>*')).toEqual([0xa9, 0x00, 0xa9, 0x10])
    expect(code('lda #3*4')).toEqual([0xa9, 12])
    expect(code('lda #(2+3)*2')).toEqual([0xa9, 10])
    expect(code('* = $1000\n jmp *+3\n nop')).toEqual([0x4c, 0x03, 0x10, 0xea])
  })

  it('number formats and operators', () => {
    expect(code('lda #$ff')).toEqual([0xa9, 0xff])
    expect(code('lda #%10101010')).toEqual([0xa9, 0xaa])
    expect(code('lda #0x7f')).toEqual([0xa9, 0x7f])
    expect(code("lda #'A'")).toEqual([0xa9, 0x41])
    expect(code('lda #7 % 4')).toEqual([0xa9, 3])
    expect(code('lda #1<<4 | 3')).toEqual([0xa9, 0x13])
    expect(code('lda #$f0 & $3c ^ 1')).toEqual([0xa9, 0x31])
    expect(code('lda #-1')).toEqual([0xa9, 0xff])
    expect(code('lda #<$1234\n lda #>$1234')).toEqual([0xa9, 0x34, 0xa9, 0x12])
    expect(asm('lda #1/0').errors[0].message).toMatch(/Division durch null/)
  })

  it('reports unknown symbols and syntax errors with the line number', () => {
    const r = asm('nop\n lda nothing\n lda #(1+')
    expect(r.errors.map((e) => e.line)).toEqual([2, 3])
  })
})

describe('labels and constants', () => {
  it('supports labels with and without colon, and @local labels per global label', () => {
    const src = `* = $0900
first:
@loop dex
 bne @loop
second
@loop inx
 bne @loop
 rts`
    const r = asm(src)
    expect(r.errors).toEqual([])
    expect(Array.from(r.prg!.subarray(2))).toEqual([0xca, 0xd0, 0xfd, 0xe8, 0xd0, 0xfd, 0x60])
  })

  it('reports duplicate labels and constants', () => {
    expect(asm('a: nop\na: nop').errors[0].message).toMatch(/doppelt/)
    expect(asm('x = 1\nx = 2').errors[0].message).toMatch(/doppelt/)
  })

  it('treats a mnemonic written at column 0 as an instruction, not a label', () => {
    expect(code('nop\nrts')).toEqual([0xea, 0x60])
  })
})

describe('directives', () => {
  it('.byte/.word/.text and friends, with and without the dot or bang', () => {
    expect(code('.byte 1, $ff, "AB", <$1234')).toEqual([1, 0xff, 0x41, 0x42, 0x34])
    expect(code('!byte 7\n.db 8\n.by 9')).toEqual([7, 8, 9])
    expect(code('.word $1234, 2\n.dw 1\n.wo 2')).toEqual([0x34, 0x12, 2, 0, 1, 0, 2, 0])
    expect(code('.text "Hi"\n.asc "!"')).toEqual([0x48, 0x69, 0x21])
    expect(code('.pet "aB"')).toEqual([0x41, 0xc2])
    expect(code('.scr "ab@"')).toEqual([1, 2, 0])
    expect(code('.fill 3, $aa\n.fill 2')).toEqual([0xaa, 0xaa, 0xaa, 0, 0])
    expect(code('.byte "a;b" ; comment')).toEqual([0x61, 0x3b, 0x62])
    expect(code(".byte ';'")).toEqual([0x3b])
  })

  it('.byte values must fit, forward references in data resolve', () => {
    expect(asm('.byte 256').errors[0].message).toMatch(/passt nicht/)
    expect(code('* = $0800\n.word later\nlater: nop')).toEqual([0x02, 0x08, 0xea])
  })

  it('.org and * = move the program counter; the gap is zero-filled, going back is an error', () => {
    const r = asm('* = $1000\n nop\n* = $1004\n rts')
    expect(r.errors).toEqual([])
    expect(hex(r.prg)).toBe('0010' + 'ea' + '000000' + '60')
    expect(asm('* = $1000\n nop\n nop\n.org $1001\n rts').errors[0].message).toMatch(/zurückspringend/)
  })

  it('.basic emits a SYS line that points at the code', () => {
    const r = asm('.basic\nstart: lda #0\n rts')
    expect(r.errors).toEqual([])
    const prg = r.prg!
    // load $0801, link $080b, line 10, SYS, "2061", 0, end marker 00 00
    expect(hex(prg.subarray(0, 14))).toBe('0108' + '0b08' + '0a00' + '9e' + '32303631' + '00' + '0000')
    expect(r.symbols.get('start')).toBe(2061)
    expect(prg.length).toBe(2 + 12 + 3)
    expect(asm('nop\n.basic').errors[0].message).toMatch(/vor dem ersten Code/)
  })

  it('.basic works for other start addresses', () => {
    const r = asm('* = $1c01\n.basic\nstart: rts')
    expect(r.symbols.get('start')).toBe(0x1c01 + 12)
    expect(Buffer.from(r.prg!.subarray(7, 11)).toString('latin1')).toBe(String(0x1c01 + 12))
  })

  it('refuses macros, includes and conditionals instead of mis-assembling them', () => {
    for (const d of ['.include "x.asm"', '.macro foo', '.if 1', '.endif', '.import x']) {
      expect(asm(d).errors[0].message, d).toMatch(/nicht unterstützt/)
    }
    expect(asm('.nonsense').errors[0].message).toMatch(/Unbekannte Direktive/)
  })
})

describe('output', () => {
  it('returns a PRG with the origin as load address and lists the generated bytes', () => {
    const r = asm('* = $c000\n lda #1\n rts')
    expect(hex(r.prg)).toBe('00c0' + 'a901' + '60')
    expect(r.origin).toBe(0xc000)
    expect(r.end).toBe(0xc003)
    expect(r.listing).toEqual([
      { line: 2, address: 0xc000, bytes: [0xa9, 1] },
      { line: 3, address: 0xc002, bytes: [0x60] },
    ])
  })

  it('does not return a PRG when there are errors, and warns about empty programs', () => {
    expect(asm('lda').prg).toBeUndefined()
    expect(asm('; nothing').warnings).toHaveLength(1)
  })

  it('handles Windows and Mac line endings', () => {
    expect(code('nop\r\nrts')).toEqual([0xea, 0x60])
    expect(code('nop\rrts')).toEqual([0xea, 0x60])
  })

  it('round trip: what is assembled disassembles to the same instructions', () => {
    const src = `* = $c000
start: ldx #$00
loop: lda text,x
 sta $0400,x
 inx
 cpx #5
 bne loop
 rts
text: .text "hello"`
    const r = asm(src)
    expect(r.errors).toEqual([])
    const mnemonics = disassemble6502(r.prg!).slice(0, 7).map((l) => l.find((t) => t.cls === 'tok-fn')!.text)
    expect(mnemonics).toEqual(['LDX', 'LDA', 'STA', 'INX', 'CPX', 'BNE', 'RTS'])
  })
})
