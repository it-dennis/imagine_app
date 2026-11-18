import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { createHash } from 'crypto'
import {
  defaultDialect, defaultLoadAddress, encodeDocument, isDirty, loadDocument, newDocument, saveDocument, sha256Hex,
} from '../../src/renderer/lib/editor-doc'
import { outputName } from '../../src/renderer/lib/editor-actions'
import { DIALECTS, tokenize } from '../../src/renderer/lib/lang/basic'
import { bytesToText, detectSeparator, separatorFor, textToBytes } from '../../src/renderer/lib/lang/text-codec'
import type { DiskFile, VirtualDisk } from '../../src/shared/types'

const FIXTURES = join(__dirname, '..', 'fixtures', 'oracle')
const b64 = (b: Uint8Array) => Buffer.from(b).toString('base64')
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex')

const disk = (system: VirtualDisk['system'] = 'c64'): VirtualDisk => ({
  id: 'd1', name: 'T', system, format: 'd64', path: 'x.d64', capacityBytes: 0, freeBytes: 0, files: [], writeProtected: false, modified: false, createdAt: '',
})
const file = (name: string, over: Partial<DiskFile> = {}): DiskFile => ({ name, type: 'PRG', sizeBytes: 0, blocks: 0, startTrack: 1, startSector: 0, ...over })

let api: { openFile: ReturnType<typeof vi.fn>; saveFile: ReturnType<typeof vi.fn>; createFile: ReturnType<typeof vi.fn> }
beforeEach(() => {
  api = { openFile: vi.fn(), saveFile: vi.fn(), createFile: vi.fn() }
  vi.stubGlobal('window', { imagineAPI: { disk: api } })
})

describe('text codec', () => {
  it('maps every byte value to a character and back without change', () => {
    const all = Uint8Array.from({ length: 256 }, (_, i) => i)
    const text = bytesToText(all)
    expect(text).toHaveLength(256)
    expect(textToBytes(text).bytes).toEqual(all)
  })

  it('large files do not overflow the call stack', () => {
    const big = new Uint8Array(300_000).fill(0x41)
    expect(bytesToText(big)).toHaveLength(300_000)
  })

  it('detects and preserves line separators, per system defaults for new files', () => {
    expect(detectSeparator('a\r\nb')).toBe('\r\n')
    expect(detectSeparator('a\nb')).toBe('\n')
    expect(detectSeparator('a\rb')).toBe('\r')
    expect(detectSeparator('abc', '\r')).toBe('\r')
    expect(separatorFor('c64')).toBe('\r')
    expect(separatorFor('amiga')).toBe('\n')
    expect(separatorFor('dos')).toBe('\r\n')
  })

  it('refuses characters that do not fit in a byte instead of corrupting them', () => {
    expect(textToBytes('abc€').badChar).toEqual({ index: 3, char: '€' })
  })
})

describe('loading documents', () => {
  it('opens a petcat-made BASIC program for editing and detects the dialect', async () => {
    const prg = readFileSync(join(FIXTURES, 'basic-v70.prg'))
    api.openFile.mockResolvedValue({ data: b64(prg), sha256: sha(prg) })
    const doc = await loadDocument(disk('c128'), file('PROG'), 'basic')
    expect(doc.readOnlyReason).toBeNull()
    expect(doc.dialect).toBe('v70')
    expect(doc.loadAddress).toBe(0x1c01)
    expect(doc.text).toContain('10 DOPEN#1')
    expect(doc.separator).toBe('\n')
    expect(isDirty(doc)).toBe(false)
  })

  it('opens machine code behind BASIC read-only', async () => {
    const prg = Uint8Array.from([...tokenize('10 sys 2064', DIALECTS.v2).prg, 0xa9, 0, 0x60])
    api.openFile.mockResolvedValue({ data: b64(prg), sha256: sha(prg) })
    const doc = await loadDocument(disk(), file('ML'), 'basic')
    expect(doc.readOnlyReason).toMatch(/weitere Bytes/)
  })

  it('opens any file as text, keeping its own line endings and every byte', async () => {
    const bytes = Uint8Array.from([0x68, 0x69, 0x0d, 0xc1, 0xff, 0x0d, 0x00])
    api.openFile.mockResolvedValue({ data: b64(bytes), sha256: sha(bytes) })
    const doc = await loadDocument(disk(), file('NOTES', { type: 'SEQ' }), 'text')
    expect(doc.separator).toBe('\r')
    expect(encodeDocument(doc).bytes).toEqual(bytes)
  })

  it('passes the directory entry, not just the name, to the main process', async () => {
    api.openFile.mockResolvedValue({ data: b64(Uint8Array.from([0x41])), sha256: 'x' })
    await loadDocument(disk(), file('DUP', { startTrack: 17, startSector: 5 }), 'text')
    expect(api.openFile).toHaveBeenCalledWith('d1', expect.objectContaining({ name: 'DUP', startTrack: 17, startSector: 5 }))
  })
})

describe('new documents', () => {
  it('BASIC text uses LF, plain files on a C64 disk use CR, and each kind gets a fitting file type', () => {
    expect(newDocument(disk('c64'), 'A', 'basic').separator).toBe('\n')
    expect(newDocument(disk('c64'), 'A', 'text').separator).toBe('\r')
    expect(newDocument(disk('dos'), 'A', 'text').separator).toBe('\r\n')
    expect(newDocument(disk('c64'), 'A', 'basic').fileType).toBe('PRG')
    expect(newDocument(disk('c64'), 'A', 'asm').fileType).toBe('SEQ')
    expect(newDocument(disk('dos'), 'A', 'text').fileType).toBe('FILE')
  })

  it('picks the BASIC dialect and start address from the system', () => {
    expect(defaultDialect('plus4')).toBe('v35')
    expect(defaultDialect('c128')).toBe('v70')
    expect(defaultDialect('vic20')).toBe('v2')
    expect(defaultLoadAddress('c64', 'v2')).toBe(0x0801)
    expect(defaultLoadAddress('vic20', 'v2')).toBe(0x1001)
    expect(defaultLoadAddress('plus4', 'v35')).toBe(0x1001)
    expect(defaultLoadAddress('c128', 'v70')).toBe(0x1c01)
  })
})

describe('encoding and saving', () => {
  it('BASIC text becomes exactly what the tokenizer produces', () => {
    const doc = { ...newDocument(disk(), 'P', 'basic'), text: '10 print "x"\n20 goto 10' }
    expect(encodeDocument(doc).bytes).toEqual(tokenize(doc.text, DIALECTS.v2).prg)
  })

  it('syntax errors block saving and say which line', async () => {
    const doc = { ...newDocument(disk(), 'P', 'basic'), text: '10 print\noops' }
    expect(encodeDocument(doc).bytes).toBeUndefined()
    await expect(saveDocument(doc)).rejects.toThrow(/Zeile 2/)
    expect(api.createFile).not.toHaveBeenCalled()
  })

  it('a new file is created, an existing one is saved with the hash it was loaded with', async () => {
    const fresh = { ...newDocument(disk(), 'NEW', 'text'), text: 'hi' }
    api.createFile.mockResolvedValue({ disk: disk(), file: file('NEW', { startTrack: 3, startSector: 4 }) })
    const created = await saveDocument(fresh)
    expect(api.createFile).toHaveBeenCalledWith('d1', { name: 'NEW', type: 'SEQ' }, b64(Uint8Array.from([0x68, 0x69])))
    expect(created.doc.ref).toMatchObject({ startTrack: 3, startSector: 4 })
    expect(created.doc.sha256).toBe(await sha256Hex(Uint8Array.from([0x68, 0x69])))
    expect(isDirty(created.doc)).toBe(false)

    api.saveFile.mockResolvedValue({ disk: disk(), file: file('NEW', { startTrack: 9, startSector: 9 }) })
    const edited = { ...created.doc, text: 'hi there' }
    const saved = await saveDocument(edited)
    expect(api.saveFile).toHaveBeenCalledWith('d1', created.doc.ref, expect.any(String), created.doc.sha256)
    expect(saved.doc.ref).toMatchObject({ startTrack: 9, startSector: 9 }) // follows the file if it moved
  })

  it('does not save read-only documents', async () => {
    const doc = { ...newDocument(disk(), 'P', 'basic'), text: '10 end', readOnlyReason: 'x' }
    await expect(saveDocument(doc)).rejects.toThrow(/schreibgeschützt/)
  })

  it('a main-process refusal (file changed meanwhile) reaches the caller and nothing is marked saved', async () => {
    const doc = { ...newDocument(disk(), 'NEW', 'text'), ref: { name: 'NEW', startTrack: 1, startSector: 1 }, sha256: 'old', text: 'changed', savedText: 'orig' }
    api.saveFile.mockRejectedValue(new Error('The file on the disk changed since you opened it'))
    await expect(saveDocument(doc)).rejects.toThrow(/changed since you opened it/)
  })
})

describe('assembler output names', () => {
  it('strips a source extension, or appends .PRG when there is none', () => {
    expect(outputName('TEST.ASM')).toBe('TEST')
    expect(outputName('game.s')).toBe('game')
    expect(outputName('SRC.A65')).toBe('SRC')
    expect(outputName('PLAIN')).toBe('PLAIN.PRG')
  })
})

describe('which emulator a program needs', () => {
  it('follows the BASIC dialect, not the disk (a D71 can hold C64 or C128 programs)', async () => {
    const { emulatorSystemFor } = await import('../../src/renderer/lib/emulator-actions')
    expect(emulatorSystemFor({ kind: 'basic', dialect: 'v70', system: 'c64' })).toBe('c128')
    expect(emulatorSystemFor({ kind: 'basic', dialect: 'v35', system: 'c64' })).toBe('plus4')
    expect(emulatorSystemFor({ kind: 'basic', dialect: 'v2', system: 'c128' })).toBe('c64')
    expect(emulatorSystemFor({ kind: 'basic', dialect: 'v2', system: 'vic20' })).toBe('vic20')
    expect(emulatorSystemFor({ kind: 'asm', dialect: 'v2', system: 'plus4' })).toBe('plus4')
  })
})
