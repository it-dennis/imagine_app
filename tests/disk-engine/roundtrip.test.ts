import { describe, it, expect } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { getPlugin, formatFromPath } from '../../src/main/services/disk-engine'
import { buildIso9660 } from '../../src/main/services/disk-engine/iso-writer'
import type { DiskFormat } from '../../src/shared/types'

/** Deterministic pseudo-random payload so failures are reproducible. */
function payload(size: number, seed = 1): Buffer {
  const buf = Buffer.alloc(size)
  let x = seed
  for (let i = 0; i < size; i++) {
    x = (x * 1103515245 + 12345) & 0x7fffffff
    buf[i] = x >> 16
  }
  return buf
}

// [format, small file size, large file size (spans many sectors/clusters/extension blocks)]
const WRITABLE: [DiskFormat, number, number][] = [
  ['d64', 100, 40_000],
  ['st', 100, 200_000],
  ['img', 100, 500_000],
  ['adf', 100, 100_000],
  ['msa', 100, 200_000],
]

describe.each(WRITABLE)('%s roundtrip', (format, small, large) => {
  const plugin = getPlugin(format)

  it('formats a blank disk with the requested label', async () => {
    const disk = await plugin.format({ label: 'TESTDISK' })
    const info = await plugin.parse(disk)
    expect(info.label).toContain('TESTDISK')
    expect(info.freeBytes).toBeGreaterThan(0)
    expect(info.freeBytes).toBeLessThanOrEqual(info.capacityBytes)
    expect(await plugin.listFiles(disk)).toHaveLength(0)
  })

  it('writes, reads back byte-exact and deletes small and large files', async () => {
    let disk = await plugin.format({ label: 'TESTDISK' })
    const baseline = (await plugin.parse(disk)).freeBytes

    const a = payload(small, 7)
    const b = payload(large, 11)
    disk = await plugin.writeFile(disk, { name: 'SMALL', data: a }, { name: 'SMALL', type: 'PRG' })
    disk = await plugin.writeFile(disk, { name: 'LARGE', data: b }, { name: 'LARGE', type: 'PRG' })

    const names = (await plugin.listFiles(disk)).map((f) => f.name.toUpperCase())
    expect(names).toEqual(expect.arrayContaining(['SMALL', 'LARGE']))
    expect((await plugin.parse(disk)).freeBytes).toBeLessThan(baseline)

    expect((await plugin.readFile(disk, 'SMALL')).equals(a)).toBe(true)
    expect((await plugin.readFile(disk, 'LARGE')).equals(b)).toBe(true)

    disk = await plugin.deleteFile(disk, 'LARGE')
    expect((await plugin.listFiles(disk)).map((f) => f.name.toUpperCase())).not.toContain('LARGE')
    expect((await plugin.readFile(disk, 'SMALL')).equals(a)).toBe(true)

    disk = await plugin.deleteFile(disk, 'SMALL')
    expect(await plugin.listFiles(disk)).toHaveLength(0)
    expect((await plugin.parse(disk)).freeBytes).toBe(baseline)
  })

  it('rejects a file that does not fit', async () => {
    const disk = await plugin.format({ label: 'FULL' })
    const { capacityBytes } = await plugin.parse(disk)
    await expect(
      plugin.writeFile(disk, { name: 'HUGE', data: payload(capacityBytes + 1) }, { name: 'HUGE', type: 'PRG' }),
    ).rejects.toThrow()
  })
})

describe('msa wrapper', () => {
  it('produces a compressed image that decompresses to the same ST contents', async () => {
    const msa = getPlugin('msa')
    const data = Buffer.alloc(30_000, 0xe5) // highly compressible: exercises RLE runs
    let disk = await msa.format({ label: 'RLE' })
    disk = await msa.writeFile(disk, { name: 'RUNS', data }, { name: 'RUNS', type: 'FILE' })
    expect((await msa.readFile(disk, 'RUNS')).equals(data)).toBe(true)
    expect(disk.readUInt16BE(0)).toBe(0x0e0f) // MSA magic
  })
})

describe('iso9660', () => {
  it('builds an ISO from a folder tree and reads it back', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'imagine-iso-'))
    try {
      const big = payload(5000, 3)
      await mkdir(join(dir, 'sub'))
      await writeFile(join(dir, 'hello.txt'), 'hello iso')
      await writeFile(join(dir, 'big.bin'), big)
      await writeFile(join(dir, 'sub', 'inner.txt'), 'inner')

      const iso = await buildIso9660(dir, 'TESTISO')
      expect(iso.length % 2048).toBe(0)
      expect(iso.subarray(16 * 2048 + 1, 16 * 2048 + 6).toString('ascii')).toBe('CD001')

      const plugin = getPlugin('iso')
      const info = await plugin.parse(iso)
      expect(info.label).toContain('TESTISO')

      const files = await plugin.listFiles(iso)
      const paths = files.map((f) => (f.path ?? f.name).toUpperCase().replace(/;1$/, ''))
      expect(paths).toEqual(expect.arrayContaining(['HELLO.TXT', 'BIG.BIN', 'SUB/INNER.TXT']))

      const find = (p: string) => files.find((f) => (f.path ?? f.name).toUpperCase().replace(/;1$/, '') === p)!
      const bigFile = find('BIG.BIN')
      expect((await plugin.readFile(iso, bigFile.path ?? bigFile.name)).equals(big)).toBe(true)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe('registry', () => {
  it('derives the format from the file extension', () => {
    expect(formatFromPath('C:\disks\Game.D64')).toBe('d64')
    expect(formatFromPath('/tmp/x.adf')).toBe('adf')
  })

  it('reports unregistered formats cleanly', () => {
    expect(() => getPlugin('d81')).toThrow(/not|No disk format plugin/i)
  })
})
