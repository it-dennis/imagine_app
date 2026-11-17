import { describe, it, expect } from 'vitest'
import { mkdtemp, writeFile, rm, readFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { buildLaunchCommand, emulatorFor, launchEmulator } from '../../src/main/services/emulators'

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
