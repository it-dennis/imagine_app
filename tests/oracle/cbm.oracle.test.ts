import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtemp, rm, writeFile, readFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { getPlugin, replaceFileEntry } from '../../src/main/services/disk-engine'
import { c1541, C1541 } from '../helpers/vice'
import type { DiskFormat } from '../../src/shared/types'

// VICE's c1541 as the judge for all Commodore DOS images: D64, D71 and D81.
const FORMATS: DiskFormat[] = ['d64', 'd71', 'd81']
const SIZE: Record<string, number> = { d64: 174848, d71: 349696, d81: 819200 }
let dir: string
beforeAll(async () => { dir = await mkdtemp(join(tmpdir(), 'imagine-cbm-')) })
afterAll(async () => { await rm(dir, { recursive: true, force: true }) })

function payload(size: number, seed: number): Buffer {
  const b = Buffer.alloc(size)
  let x = seed
  for (let i = 0; i < size; i++) { x = (x * 1103515245 + 12345) & 0x7fffffff; b[i] = x >> 16 }
  return b
}

describe.skipIf(!C1541).each(FORMATS)('%s plugin vs c1541', (format) => {
  const plugin = getPlugin(format)

  it('a blank disk is byte-identical to the one c1541 formats', async () => {
    const theirs = join(dir, `ref.${format}`)
    c1541('-format', 'label,ab', format, theirs)
    const ref = await readFile(theirs)
    const ours = await plugin.format({ label: 'LABEL', id: 'AB' })
    expect(ours.length).toBe(SIZE[format])
    // report the first differing offsets, which makes a mismatch easy to read
    const diffs: string[] = []
    for (let i = 0; i < ref.length && diffs.length < 8; i++) {
      if (ref[i] !== ours[i]) diffs.push(`@${i.toString(16)}: theirs ${ref[i].toString(16)} ours ${ours[i].toString(16)}`)
    }
    expect(diffs).toEqual([])
  })

  it('c1541 lists our files with the right block counts and the same free space', async () => {
    let disk = await plugin.format({ label: 'ORACLE', id: 'AB' })
    disk = await plugin.writeFile(disk, { name: 'HELLO', data: payload(100, 1) }, { name: 'HELLO', type: 'PRG' })
    disk = await plugin.writeFile(disk, { name: 'BIG', data: payload(10_000, 2) }, { name: 'BIG', type: 'SEQ' })
    const img = join(dir, `ours-${format}.${format}`)
    await writeFile(img, disk)
    const out = c1541('-attach', img, '-dir')
    expect(out).toMatch(/"ORACLE\s*" AB/i)
    expect(out).toMatch(/1\s+"HELLO\s*"\s+prg/i)
    expect(out).toMatch(/40\s+"BIG\s*"\s+seq/i)
    const free = Number(/(\d+) blocks free/i.exec(out)![1])
    expect(free * 256).toBe((await plugin.parse(disk)).freeBytes)
  })

  it('c1541 validate does not change a busy image (BAM and chains are consistent)', async () => {
    let disk = await plugin.format({ label: 'VALID', id: 'ZZ' })
    for (let i = 0; i < 14; i++) {
      disk = await plugin.writeFile(disk, { name: `F${i}`, data: payload(300 + i * 1500, i) }, { name: `F${i}`, type: 'PRG' })
    }
    disk = await plugin.deleteFile(disk, 'F3')
    disk = await plugin.deleteFile(disk, 'F7')
    disk = await plugin.writeFile(disk, { name: 'AGAIN', data: payload(9000, 99) }, { name: 'AGAIN', type: 'PRG' })
    const img = join(dir, `valid-${format}.${format}`)
    await writeFile(img, disk)
    c1541('-attach', img, '-validate')
    expect((await readFile(img)).equals(disk)).toBe(true)
  })

  it('stays consistent after replacing a file in place', async () => {
    let disk = await plugin.format({ label: 'REPLACE', id: 'RR' })
    disk = await plugin.writeFile(disk, { name: 'KEEP', data: payload(2000, 5) }, { name: 'KEEP', type: 'PRG' })
    disk = await plugin.writeFile(disk, { name: 'EDIT', data: payload(3000, 6) }, { name: 'EDIT', type: 'PRG' })
    const ref = (await plugin.listFiles(disk)).find((f) => f.name === 'EDIT')!
    const { buffer } = await replaceFileEntry(plugin, disk, ref, payload(12_000, 7))
    const img = join(dir, `replace-${format}.${format}`)
    await writeFile(img, buffer)
    c1541('-attach', img, '-validate')
    expect((await readFile(img)).equals(buffer)).toBe(true)
    // and c1541 can read the replaced file back byte-exact
    const out = join(dir, `edit-${format}.bin`)
    c1541('-attach', img, '-read', 'edit', out)
    expect((await readFile(out)).equals(payload(12_000, 7))).toBe(true)
  })

  it('we read files that c1541 wrote, byte-exact, including multi-sector files', async () => {
    const img = join(dir, `theirs-${format}.${format}`)
    const small = payload(5000, 9)
    const big = payload(60_000, 10)
    await writeFile(join(dir, 'small.prg'), small)
    await writeFile(join(dir, 'big.prg'), big)
    c1541('-format', 'theirs,tt', format, img, '-write', join(dir, 'small.prg'), 'small', '-write', join(dir, 'big.prg'), 'big')
    const disk = await readFile(img)
    expect((await plugin.parse(disk)).label).toBe('THEIRS')
    const files = await plugin.listFiles(disk)
    expect(files.map((f) => f.name).sort()).toEqual(['BIG', 'SMALL'])
    expect((await plugin.readFile(disk, 'SMALL')).equals(small)).toBe(true)
    expect((await plugin.readFile(disk, 'BIG')).equals(big)).toBe(true)
    expect(files.find((f) => f.name === 'BIG')!.blocks).toBe(Math.ceil(60_000 / 254))
  })

  it('a disk filled completely by us is valid, and one byte more is refused', async () => {
    let disk = await plugin.format({ label: 'FULL', id: 'FF' })
    const chunk = 254 * 200
    let n = 0
    // fill with files of 200 sectors until the rest is small, then add one file that takes exactly the remainder
    while ((await plugin.parse(disk)).freeBytes > chunk + 256) {
      disk = await plugin.writeFile(disk, { name: `P${n}`, data: payload(chunk, n) }, { name: `P${n}`, type: 'PRG' })
      n++
    }
    const left = (await plugin.parse(disk)).freeBytes
    disk = await plugin.writeFile(disk, { name: 'LAST', data: payload((left / 256) * 254, 77) }, { name: 'LAST', type: 'PRG' })
    expect((await plugin.parse(disk)).freeBytes).toBe(0)
    await expect(plugin.writeFile(disk, { name: 'X', data: Buffer.from([1]) }, { name: 'X', type: 'PRG' })).rejects.toThrow(/full/i)
    const img = join(dir, `full-${format}.${format}`)
    await writeFile(img, disk)
    c1541('-attach', img, '-validate')
    expect((await readFile(img)).equals(disk)).toBe(true)
  })
})
