import { describe, it, expect } from 'vitest'
import { getPlugin, readFileEntry, replaceFileEntry } from '../../src/main/services/disk-engine'
import type { DiskFormat } from '../../src/shared/types'

function payload(size: number, seed: number): Buffer {
  const b = Buffer.alloc(size)
  let x = seed
  for (let i = 0; i < size; i++) { x = (x * 1103515245 + 12345) & 0x7fffffff; b[i] = x >> 16 }
  return b
}

describe('D64 replaceFile', () => {
  const d64 = getPlugin('d64')
  const DIR_SECTOR = 357 * 256 + 256 // track 18 sector 1

  it('replaces exactly the entry by location, even with duplicate names', async () => {
    let disk = await d64.format({ label: 'DUPES', id: 'AA' })
    const a = payload(300, 1)
    const b = payload(600, 2)
    disk = await d64.writeFile(disk, { name: 'DUP', data: a }, { name: 'DUP', type: 'PRG' })
    disk = await d64.writeFile(disk, { name: 'DUP', data: b }, { name: 'DUP', type: 'PRG' })
    const [first, second] = await d64.listFiles(disk)

    const c = payload(5000, 3)
    const { buffer: updated, file } = await replaceFileEntry(d64, disk, second, c)
    expect((await readFileEntry(d64, updated, first)).equals(a)).toBe(true) // the other DUP is untouched
    const after = await d64.listFiles(updated)
    expect(after).toHaveLength(2)
    expect(file).toEqual(after[1]) // returned reference is the second entry, wherever its data now starts
    expect((await readFileEntry(d64, updated, file)).equals(c)).toBe(true)
    expect(file.blocks).toBe(Math.ceil(5000 / 254))
  })

  it('keeps the raw name bytes and type of the entry untouched', async () => {
    let disk = await d64.format({ label: 'NAMES', id: 'AA' })
    disk = await d64.writeFile(disk, { name: 'SHIFTED', data: payload(10, 4) }, { name: 'SHIFTED', type: 'SEQ' })
    // Give the entry a PETSCII shifted-letter name (0xC1 0xC2) that the display name cannot represent.
    disk[DIR_SECTOR + 5] = 0xc1
    disk[DIR_SECTOR + 6] = 0xc2
    const ref = (await d64.listFiles(disk))[0]
    const before = Buffer.from(disk.subarray(DIR_SECTOR, DIR_SECTOR + 32))

    const { buffer: updated } = await replaceFileEntry(d64, disk, ref, payload(700, 5))
    const entry = updated.subarray(DIR_SECTOR, DIR_SECTOR + 32)
    expect(entry.subarray(2, 3).equals(before.subarray(2, 3))).toBe(true) // type byte
    expect(entry.subarray(5, 21).equals(before.subarray(5, 21))).toBe(true) // 16 raw name bytes
  })

  it('leaves the original image byte-exact when the new data does not fit', async () => {
    let disk = await d64.format({ label: 'TIGHT', id: 'AA' })
    disk = await d64.writeFile(disk, { name: 'KEEP', data: payload(1000, 6) }, { name: 'KEEP', type: 'PRG' })
    const snapshot = Buffer.from(disk)
    const ref = (await d64.listFiles(disk))[0]
    await expect(replaceFileEntry(d64, disk, ref, payload(200_000, 7))).rejects.toThrow(/full/i)
    expect(disk.equals(snapshot)).toBe(true)
    expect((await readFileEntry(d64, disk, ref)).equals(payload(1000, 6))).toBe(true)
  })

  it('refuses REL files and unknown entries', async () => {
    const disk = await d64.format({ label: 'X', id: 'AA' })
    await expect(replaceFileEntry(d64, disk, { name: 'NOPE' }, Buffer.alloc(1))).rejects.toThrow(/not found/i)
  })
})

describe.each<DiskFormat>(['st', 'img', 'adf', 'msa'])('%s replaceFile (delete + write fallback)', (format) => {
  const plugin = getPlugin(format)
  it('replaces a root file and keeps its name', async () => {
    let disk = await plugin.format({ label: 'REPL' })
    disk = await plugin.writeFile(disk, { name: 'DOC.TXT', data: payload(200, 1) }, { name: 'DOC.TXT', type: 'FILE' })
    disk = await plugin.writeFile(disk, { name: 'OTHER.TXT', data: payload(50, 2) }, { name: 'OTHER.TXT', type: 'FILE' })
    const ref = (await plugin.listFiles(disk)).find((f) => f.name.toUpperCase().startsWith('DOC'))!
    const next = payload(4000, 3)
    const { buffer: updated, file: saved } = await replaceFileEntry(plugin, disk, ref, next)
    const files = await plugin.listFiles(updated)
    const doc = files.find((f) => f.name.toUpperCase().startsWith('DOC'))!
    expect(doc.name).toBe(ref.name)
    expect(saved.name).toBe(ref.name)
    expect(doc.sizeBytes).toBe(4000)
    expect((await readFileEntry(plugin, updated, doc)).equals(next)).toBe(true)
    const other = files.find((f) => f.name.toUpperCase().startsWith('OTHER'))!
    expect((await readFileEntry(plugin, updated, other)).equals(payload(50, 2))).toBe(true)
  })

  it('refuses files inside folders', async () => {
    const disk = await plugin.format({ label: 'REPL' })
    const fake = { name: 'IN.TXT', path: 'SUB/IN.TXT' }
    await expect(replaceFileEntry(plugin, disk, fake, Buffer.alloc(1))).rejects.toThrow(/not found|folders/i)
  })
})
