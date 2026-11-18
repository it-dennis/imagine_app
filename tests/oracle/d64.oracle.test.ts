import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtemp, rm, writeFile, readFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { getPlugin } from '../../src/main/services/disk-engine'
import { c1541, C1541 } from '../helpers/vice'

// The D64 plugin was originally only verified against itself. These tests let VICE's c1541 judge it.
const d64 = getPlugin('d64')
let dir: string
beforeAll(async () => { dir = await mkdtemp(join(tmpdir(), 'imagine-oracle-')) })
afterAll(async () => { await rm(dir, { recursive: true, force: true }) })

function payload(size: number, seed: number): Buffer {
  const b = Buffer.alloc(size)
  let x = seed
  for (let i = 0; i < size; i++) { x = (x * 1103515245 + 12345) & 0x7fffffff; b[i] = x >> 16 }
  return b
}

describe.skipIf(!C1541)('D64 plugin vs c1541', () => {
  it('c1541 reads our image: directory lists our files with correct block counts', async () => {
    let disk = await d64.format({ label: 'ORACLE', id: 'AB' })
    disk = await d64.writeFile(disk, { name: 'HELLO', data: payload(100, 1) }, { name: 'HELLO', type: 'PRG' })
    disk = await d64.writeFile(disk, { name: 'BIG', data: payload(10_000, 2) }, { name: 'BIG', type: 'PRG' })
    const img = join(dir, 'ours.d64')
    await writeFile(img, disk)
    const out = c1541('-attach', img, '-dir')
    expect(out).toMatch(/"ORACLE\s*" AB/i)
    expect(out).toMatch(/1\s+"HELLO\s*"\s+prg/i)
    expect(out).toMatch(/40\s+"BIG\s*"\s+prg/i) // ceil(10000/254) = 40
    expect(out).toMatch(/blocks free/i)
  })

  it('c1541 validate does not change our image (BAM and chains are consistent)', async () => {
    let disk = await d64.format({ label: 'VALID', id: 'ZZ' })
    for (let i = 0; i < 12; i++) {
      disk = await d64.writeFile(disk, { name: `F${i}`, data: payload(300 + i * 700, i) }, { name: `F${i}`, type: 'PRG' })
    }
    disk = await d64.deleteFile(disk, 'F3')
    disk = await d64.deleteFile(disk, 'F7')
    const img = join(dir, 'valid.d64')
    await writeFile(img, disk)
    c1541('-attach', img, '-validate')
    const after = await readFile(img)
    // Compare BAM sector and every directory entry's start/size; validate rewrites the BAM from the chains.
    const bamOffset = 357 * 256 // track 18 sector 0
    expect(after.subarray(bamOffset, bamOffset + 256).equals(disk.subarray(bamOffset, bamOffset + 256))).toBe(true)
    expect(after.equals(disk)).toBe(true)
  })

  it('we read files that c1541 wrote, byte-exact', async () => {
    const img = join(dir, 'theirs.d64')
    const data = payload(5000, 9)
    const src = join(dir, 'src.prg')
    await writeFile(src, data)
    c1541('-format', 'theirs,tt', 'd64', img, '-write', src, 'thing')
    const disk = await readFile(img)
    const info = await d64.parse(disk)
    expect(info.label).toBe('THEIRS')
    const files = await d64.listFiles(disk)
    expect(files.map((f) => f.name)).toEqual(['THING'])
    expect((await d64.readFile(disk, 'THING')).equals(data)).toBe(true)
    expect(files[0].blocks).toBe(Math.ceil(5000 / 254))
  })
})
