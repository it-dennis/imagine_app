import { describe, it, expect } from 'vitest'
import { mkdtemp, rm, readdir, readFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { defaultFolder, resolveFolder, sanitizeFileName, writeNewFile } from '../../src/main/services/disk-files'
import { creatableFormats } from '../../src/main/services/disk-engine'

describe('resolveFolder', () => {
  const docs = join('C:', 'Users', 'me', 'Documents')
  const home = join('C:', 'Users', 'me')

  it('falls back to <Documents>/Imagine for empty input', () => {
    expect(resolveFolder('', docs, home)).toBe(defaultFolder(docs))
    expect(resolveFolder('   ', docs, home)).toBe(join(docs, 'Imagine'))
  })

  it('expands ~ (the old wizard default that failed with ENOENT on Windows)', () => {
    expect(resolveFolder('~/Documents/Imagine', docs, home)).toBe(join(home, 'Documents', 'Imagine'))
    expect(resolveFolder('~\\Disks', docs, home)).toBe(join(home, 'Disks'))
    expect(resolveFolder('~', docs, home)).toBe(home)
  })

  it('keeps explicit folders untouched', () => {
    expect(resolveFolder('D:\\Retro\\Disks', docs, home)).toBe('D:\\Retro\\Disks')
  })
})

describe('sanitizeFileName', () => {
  it('replaces characters Windows forbids', () => {
    expect(sanitizeFileName('games/1: best?')).toBe('games_1_ best_')
  })
  it('handles reserved and empty names', () => {
    expect(sanitizeFileName('CON')).toBe('_CON')
    expect(sanitizeFileName('  ...')).toBe('untitled')
    expect(sanitizeFileName('')).toBe('untitled')
  })
})

describe('writeNewFile', () => {
  it('creates missing nested folders and never overwrites existing images', async () => {
    const root = await mkdtemp(join(tmpdir(), 'imagine-create-'))
    try {
      const folder = join(root, 'a', 'b')
      const first = await writeNewFile(folder, 'game', 'd64', Buffer.from('one'))
      const second = await writeNewFile(folder, 'game', 'd64', Buffer.from('two'))
      const third = await writeNewFile(folder, 'game', 'd64', Buffer.from('three'))
      expect([first, second, third]).toEqual([
        join(folder, 'game.d64'), join(folder, 'game (2).d64'), join(folder, 'game (3).d64'),
      ])
      expect((await readFile(first)).toString()).toBe('one')
      expect((await readdir(folder)).sort()).toEqual(['game (2).d64', 'game (3).d64', 'game.d64'])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe('creatableFormats', () => {
  it('offers only formats that have a working plugin', () => {
    const formats = creatableFormats()
    expect(formats).toEqual(expect.arrayContaining(['d64', 'd71', 'd81', 'st', 'msa', 'adf', 'img']))
    for (const f of ['dsk', 'iso']) expect(formats).not.toContain(f)
  })
})
