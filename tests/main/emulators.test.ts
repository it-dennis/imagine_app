import { describe, it, expect } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { autostartTarget, buildLaunchCommand, detectEmulators, emulatorFor, launchEmulator } from '../../src/main/services/emulators'

const prefs = { vicePath: join('C:', 'vice', 'bin', 'x64sc.exe'), hatariPath: join('C:', 'hatari', 'hatari.exe') }

describe('emulator command building', () => {
  it('maps systems to emulators', () => {
    expect(emulatorFor('c64')).toBe('vice')
    expect(emulatorFor('vic20')).toBe('vice')
    expect(emulatorFor('plus4')).toBe('vice')
    expect(emulatorFor('atariST')).toBe('hatari')
    expect(() => emulatorFor('amiga')).toThrow(/No emulator/)
  })

  it('autostarts a C64 disk that has files', () => {
    const c = buildLaunchCommand({ system: 'c64', diskPath: 'D:/my disks/game.d64', hasFiles: true }, prefs)
    expect(c).toEqual({ kind: 'vice', command: prefs.vicePath, args: ['-autostart', 'D:/my disks/game.d64'] })
  })

  it('only attaches an empty disk instead of autostarting it', () => {
    const c = buildLaunchCommand({ system: 'c64', diskPath: 'e.d64', hasFiles: false }, prefs)
    expect(c.args).toEqual(['-8', 'e.d64'])
  })

  it('derives the VIC-20 and Plus/4 binaries from the x64sc folder', () => {
    expect(buildLaunchCommand({ system: 'vic20' }, prefs).command).toBe(join('C:', 'vice', 'bin', 'xvic.exe'))
    expect(buildLaunchCommand({ system: 'plus4' }, prefs).command).toBe(join('C:', 'vice', 'bin', 'xplus4.exe'))
  })

  it('starts blank sessions without arguments', () => {
    expect(buildLaunchCommand({ system: 'c64' }, prefs).args).toEqual([])
    expect(buildLaunchCommand({ system: 'atariST' }, prefs).args).toEqual([])
  })

  it('attaches Atari disks as floppy A for Hatari', () => {
    const c = buildLaunchCommand({ system: 'atariST', diskPath: 'x.msa' }, prefs)
    expect(c).toEqual({ kind: 'hatari', command: prefs.hatariPath, args: ['--disk-a', 'x.msa'] })
  })

  it('explains a missing emulator path', () => {
    expect(() => buildLaunchCommand({ system: 'c64' }, {})).toThrow(/VICE path is not set/)
    expect(() => buildLaunchCommand({ system: 'atariST' }, { vicePath: 'x' })).toThrow(/Hatari path is not set/)
  })
})

describe('launchEmulator', () => {
  it('reports a missing executable cleanly', async () => {
    await expect(launchEmulator({ kind: 'vice', command: join(tmpdir(), 'nope-x64sc'), args: [] })).rejects.toThrow(/not found/)
  })

  it('spawns the program with the exact arguments and reports its exit', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'imagine-emu-'))
    try {
      const out = join(dir, 'args.json')
      // A tiny stand-in "emulator": node running a script that records its argv (real emulators are plain executables).
      const script = join(dir, 'fake-emu.js')
      await writeFile(script, `require('fs').writeFileSync(${JSON.stringify(out)}, JSON.stringify(process.argv.slice(2)))`)

      const exited = new Promise<void>((resolve, reject) => {
        launchEmulator({ kind: 'vice', command: process.execPath, args: [script, '-autostart', 'my disk.d64'] }, resolve).catch(reject)
      })
      await exited
      expect(JSON.parse(await readFile(out, 'utf-8'))).toEqual(['-autostart', 'my disk.d64'])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe('detectEmulators', () => {
  async function tree(files: string[]) {
    const root = await mkdtemp(join(tmpdir(), 'imagine-detect-'))
    for (const f of files) {
      await mkdir(join(root, ...f.split('/').slice(0, -1)), { recursive: true })
      await writeFile(join(root, ...f.split('/')), '')
    }
    return root
  }

  it('finds VICE in a bin folder and Hatari next to its folder name, preferring the newest version', async () => {
    const root = await tree([
      'GTK3VICE-3.7-win64/bin/x64sc.exe',
      'GTK3VICE-3.9-win64/bin/x64sc.exe',
      'hatari-2.5/hatari.exe',
    ])
    try {
      const found = await detectEmulators({ platform: 'win32', env: {}, roots: [root] })
      expect(found.vicePath).toBe(join(root, 'GTK3VICE-3.9-win64', 'bin', 'x64sc.exe'))
      expect(found.hatariPath).toBe(join(root, 'hatari-2.5', 'hatari.exe'))
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('finds binaries directly on the PATH', async () => {
    const root = await tree(['tools/x64sc', 'tools/hatari'])
    try {
      const found = await detectEmulators({ platform: 'linux', env: { PATH: join(root, 'tools') }, roots: [] })
      expect(found).toEqual({ vicePath: join(root, 'tools', 'x64sc'), hatariPath: join(root, 'tools', 'hatari') })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('finds macOS app bundles', async () => {
    const root = await tree(['Hatari.app/Contents/MacOS/hatari'])
    try {
      const found = await detectEmulators({ platform: 'darwin', env: {}, roots: [root] })
      // Windows/macOS file systems are case-insensitive, so the bundle may be reported as hatari.app.
      expect(found.hatariPath?.toLowerCase()).toBe(join(root, 'Hatari.app', 'Contents', 'MacOS', 'hatari').toLowerCase())
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('returns an empty result when nothing is installed', async () => {
    const root = await tree(['unrelated/readme.txt'])
    try {
      expect(await detectEmulators({ platform: 'win32', env: {}, roots: [root, join(root, 'missing')] })).toEqual({})
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe('running a specific program', () => {
  it('passes image:name in lowercase (VICE treats ASCII capitals as shifted PETSCII)', () => {
    expect(autostartTarget('D:/x.d64', 'HELLO')).toBe('D:/x.d64:hello')
    expect(autostartTarget('D:/x.d64', 'My Prog-1.PRG')).toBe('D:/x.d64:my prog-1.prg')
  })

  it('falls back to the first program when the name cannot be passed reliably', () => {
    expect(autostartTarget('D:/x.d64', 'A:B')).toBe('D:/x.d64')
    expect(autostartTarget('D:/x.d64', 'NAMEÄ')).toBe('D:/x.d64')
    expect(autostartTarget('D:/x.d64', 'THIS NAME IS TOO LONG')).toBe('D:/x.d64')
    expect(autostartTarget('D:/x.d64')).toBe('D:/x.d64')
  })

  it('uses -autostart image:name for a disk with files and the C128 binary for c128', () => {
    const c = buildLaunchCommand({ system: 'c64', diskPath: 'e.d64', hasFiles: true, program: 'PROG' }, prefs)
    expect(c.args).toEqual(['-autostart', 'e.d64:prog'])
    expect(buildLaunchCommand({ system: 'c128' }, prefs).command).toBe(join('C:', 'vice', 'bin', 'x128.exe'))
  })
})
