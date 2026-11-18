export interface Token {
  text: string
  cls?: string
}

// Disassembler for the 151 documented 6502 opcodes (no illegal/undocumented
// opcodes). PRG files store a 2-byte load address; disassembly addresses
// are relative to that load address, matching how the code would actually
// sit in memory once loaded.

type Mode = 'IMP' | 'ACC' | 'IMM' | 'ZP' | 'ZPX' | 'ZPY' | 'ABS' | 'ABX' | 'ABY' | 'IND' | 'IZX' | 'IZY' | 'REL'

const MODE_LENGTH: Record<Mode, number> = {
  IMP: 1, ACC: 1, IMM: 2, ZP: 2, ZPX: 2, ZPY: 2,
  ABS: 3, ABX: 3, ABY: 3, IND: 3, IZX: 2, IZY: 2, REL: 2,
}

const OPCODES: Record<number, [string, Mode]> = {
  0x00: ['BRK', 'IMP'], 0x01: ['ORA', 'IZX'], 0x05: ['ORA', 'ZP'], 0x06: ['ASL', 'ZP'],
  0x08: ['PHP', 'IMP'], 0x09: ['ORA', 'IMM'], 0x0a: ['ASL', 'ACC'], 0x0d: ['ORA', 'ABS'],
  0x0e: ['ASL', 'ABS'], 0x10: ['BPL', 'REL'], 0x11: ['ORA', 'IZY'], 0x15: ['ORA', 'ZPX'],
  0x16: ['ASL', 'ZPX'], 0x18: ['CLC', 'IMP'], 0x19: ['ORA', 'ABY'], 0x1d: ['ORA', 'ABX'],
  0x1e: ['ASL', 'ABX'], 0x20: ['JSR', 'ABS'], 0x21: ['AND', 'IZX'], 0x24: ['BIT', 'ZP'],
  0x25: ['AND', 'ZP'], 0x26: ['ROL', 'ZP'], 0x28: ['PLP', 'IMP'], 0x29: ['AND', 'IMM'],
  0x2a: ['ROL', 'ACC'], 0x2c: ['BIT', 'ABS'], 0x2d: ['AND', 'ABS'], 0x2e: ['ROL', 'ABS'],
  0x30: ['BMI', 'REL'], 0x31: ['AND', 'IZY'], 0x35: ['AND', 'ZPX'], 0x36: ['ROL', 'ZPX'],
  0x38: ['SEC', 'IMP'], 0x39: ['AND', 'ABY'], 0x3d: ['AND', 'ABX'], 0x3e: ['ROL', 'ABX'],
  0x40: ['RTI', 'IMP'], 0x41: ['EOR', 'IZX'], 0x45: ['EOR', 'ZP'], 0x46: ['LSR', 'ZP'],
  0x48: ['PHA', 'IMP'], 0x49: ['EOR', 'IMM'], 0x4a: ['LSR', 'ACC'], 0x4c: ['JMP', 'ABS'],
  0x4d: ['EOR', 'ABS'], 0x4e: ['LSR', 'ABS'], 0x50: ['BVC', 'REL'], 0x51: ['EOR', 'IZY'],
  0x55: ['EOR', 'ZPX'], 0x56: ['LSR', 'ZPX'], 0x58: ['CLI', 'IMP'], 0x59: ['EOR', 'ABY'],
  0x5d: ['EOR', 'ABX'], 0x5e: ['LSR', 'ABX'], 0x60: ['RTS', 'IMP'], 0x61: ['ADC', 'IZX'],
  0x65: ['ADC', 'ZP'], 0x66: ['ROR', 'ZP'], 0x68: ['PLA', 'IMP'], 0x69: ['ADC', 'IMM'],
  0x6a: ['ROR', 'ACC'], 0x6c: ['JMP', 'IND'], 0x6d: ['ADC', 'ABS'], 0x6e: ['ROR', 'ABS'],
  0x70: ['BVS', 'REL'], 0x71: ['ADC', 'IZY'], 0x75: ['ADC', 'ZPX'], 0x76: ['ROR', 'ZPX'],
  0x78: ['SEI', 'IMP'], 0x79: ['ADC', 'ABY'], 0x7d: ['ADC', 'ABX'], 0x7e: ['ROR', 'ABX'],
  0x81: ['STA', 'IZX'], 0x84: ['STY', 'ZP'], 0x85: ['STA', 'ZP'], 0x86: ['STX', 'ZP'],
  0x88: ['DEY', 'IMP'], 0x8a: ['TXA', 'IMP'], 0x8c: ['STY', 'ABS'], 0x8d: ['STA', 'ABS'],
  0x8e: ['STX', 'ABS'], 0x90: ['BCC', 'REL'], 0x91: ['STA', 'IZY'], 0x94: ['STY', 'ZPX'],
  0x95: ['STA', 'ZPX'], 0x96: ['STX', 'ZPY'], 0x98: ['TYA', 'IMP'], 0x99: ['STA', 'ABY'],
  0x9a: ['TXS', 'IMP'], 0x9d: ['STA', 'ABX'], 0xa0: ['LDY', 'IMM'], 0xa1: ['LDA', 'IZX'],
  0xa2: ['LDX', 'IMM'], 0xa4: ['LDY', 'ZP'], 0xa5: ['LDA', 'ZP'], 0xa6: ['LDX', 'ZP'],
  0xa8: ['TAY', 'IMP'], 0xa9: ['LDA', 'IMM'], 0xaa: ['TAX', 'IMP'], 0xac: ['LDY', 'ABS'],
  0xad: ['LDA', 'ABS'], 0xae: ['LDX', 'ABS'], 0xb0: ['BCS', 'REL'], 0xb1: ['LDA', 'IZY'],
  0xb4: ['LDY', 'ZPX'], 0xb5: ['LDA', 'ZPX'], 0xb6: ['LDX', 'ZPY'], 0xb8: ['CLV', 'IMP'],
  0xb9: ['LDA', 'ABY'], 0xba: ['TSX', 'IMP'], 0xbc: ['LDY', 'ABX'], 0xbd: ['LDA', 'ABX'],
  0xbe: ['LDX', 'ABY'], 0xc0: ['CPY', 'IMM'], 0xc1: ['CMP', 'IZX'], 0xc4: ['CPY', 'ZP'],
  0xc5: ['CMP', 'ZP'], 0xc6: ['DEC', 'ZP'], 0xc8: ['INY', 'IMP'], 0xc9: ['CMP', 'IMM'],
  0xca: ['DEX', 'IMP'], 0xcc: ['CPY', 'ABS'], 0xcd: ['CMP', 'ABS'], 0xce: ['DEC', 'ABS'],
  0xd0: ['BNE', 'REL'], 0xd1: ['CMP', 'IZY'], 0xd5: ['CMP', 'ZPX'], 0xd6: ['DEC', 'ZPX'],
  0xd8: ['CLD', 'IMP'], 0xd9: ['CMP', 'ABY'], 0xdd: ['CMP', 'ABX'], 0xde: ['DEC', 'ABX'],
  0xe0: ['CPX', 'IMM'], 0xe1: ['SBC', 'IZX'], 0xe4: ['CPX', 'ZP'], 0xe5: ['SBC', 'ZP'],
  0xe6: ['INC', 'ZP'], 0xe8: ['INX', 'IMP'], 0xe9: ['SBC', 'IMM'], 0xea: ['NOP', 'IMP'],
  0xec: ['CPX', 'ABS'], 0xed: ['SBC', 'ABS'], 0xee: ['INC', 'ABS'], 0xf0: ['BEQ', 'REL'],
  0xf1: ['SBC', 'IZY'], 0xf5: ['SBC', 'ZPX'], 0xf6: ['INC', 'ZPX'], 0xf8: ['SED', 'IMP'],
  0xf9: ['SBC', 'ABY'], 0xfd: ['SBC', 'ABX'], 0xfe: ['INC', 'ABX'],
}

const hex2 = (n: number) => n.toString(16).padStart(2, '0')
const hex4 = (n: number) => (n & 0xffff).toString(16).padStart(4, '0')

function formatOperand(mode: Mode, bytes: Uint8Array, pos: number, addr: number): string {
  switch (mode) {
    case 'IMP': return ''
    case 'ACC': return 'A'
    case 'IMM': return `#$${hex2(bytes[pos + 1])}`
    case 'ZP': return `$${hex2(bytes[pos + 1])}`
    case 'ZPX': return `$${hex2(bytes[pos + 1])},X`
    case 'ZPY': return `$${hex2(bytes[pos + 1])},Y`
    case 'ABS': return `$${hex4(bytes[pos + 1] | (bytes[pos + 2] << 8))}`
    case 'ABX': return `$${hex4(bytes[pos + 1] | (bytes[pos + 2] << 8))},X`
    case 'ABY': return `$${hex4(bytes[pos + 1] | (bytes[pos + 2] << 8))},Y`
    case 'IND': return `($${hex4(bytes[pos + 1] | (bytes[pos + 2] << 8))})`
    case 'IZX': return `($${hex2(bytes[pos + 1])},X)`
    case 'IZY': return `($${hex2(bytes[pos + 1])}),Y`
    case 'REL': {
      const offset = (bytes[pos + 1] << 24) >> 24 // sign-extend int8
      return `$${hex4(addr + 2 + offset)}`
    }
  }
}

const MAX_BYTES = 16384

export function disassemble6502(bytes: Uint8Array): Token[][] {
  if (bytes.length < 2) return []
  const loadAddress = bytes[0] | (bytes[1] << 8)
  const code = bytes.subarray(2)
  const limit = Math.min(code.length, MAX_BYTES)
  const lines: Token[][] = []
  let pos = 0

  while (pos < limit) {
    const addr = loadAddress + pos
    const addrText = `$${hex4(addr)}`
    const opcode = code[pos]
    const info = OPCODES[opcode]

    if (!info) {
      lines.push([
        { text: addrText, cls: 'tok-addr' },
        { text: '  ' },
        { text: hex2(opcode), cls: 'tok-num' },
        { text: '        ' },
        { text: '.byte', cls: 'tok-op' },
        { text: ` $${hex2(opcode)}` },
      ])
      pos += 1
      continue
    }

    const [mnemonic, mode] = info
    const len = MODE_LENGTH[mode]
    if (pos + len > code.length) {
      lines.push([{ text: addrText, cls: 'tok-addr' }, { text: `  ${mnemonic} (abgeschnitten)` }])
      break
    }
    const bytesHex = Array.from(code.subarray(pos, pos + len)).map(hex2).join(' ')
    const operand = formatOperand(mode, code, pos, addr)
    lines.push([
      { text: addrText, cls: 'tok-addr' },
      { text: '  ' },
      { text: bytesHex.padEnd(8), cls: 'tok-num' },
      { text: ' ' },
      { text: mnemonic, cls: 'tok-fn' },
      { text: operand ? ' ' + operand : '' },
    ])
    pos += len
  }

  if (code.length > MAX_BYTES) {
    lines.push([{ text: `… (${(code.length - MAX_BYTES).toLocaleString()} weitere Bytes nicht angezeigt)` }])
  }

  return lines
}
