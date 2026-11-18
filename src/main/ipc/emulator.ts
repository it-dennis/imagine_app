import { ipcMain, BrowserWindow } from 'electron'
import { stat } from 'fs/promises'
import { getOpenDisk } from '../services/disk-registry'
import { buildLaunchCommand, detectEmulators, launchEmulator } from '../services/emulators'
import { readPrefs } from './prefs'
import type { System } from '../../shared/types'

export function registerEmulatorHandlers(): void {
  ipcMain.handle('emu:detect', () => detectEmulators())

  /** Launches the emulator for an open disk, or a blank session for `system` when no disk is given. */
  ipcMain.handle(
    'emu:launch',
    async (e, opts: { diskId?: string; system?: System; hasFiles?: boolean; program?: string }) => {
      const prefs = await readPrefs()
      const disk = opts.diskId ? getOpenDisk(opts.diskId) : null
      // an explicit system wins: a D71 can hold C64 or C128 programs, the program decides
      const system = opts.system ?? disk?.system ?? 'c64'
      const cmd = buildLaunchCommand(
        { system, diskPath: disk?.path, hasFiles: opts.hasFiles, program: opts.program },
        { vicePath: prefs.vicePath as string | undefined, hatariPath: prefs.hatariPath as string | undefined },
      )

      const before = disk ? (await stat(disk.path)).mtimeMs : 0
      const win = BrowserWindow.fromWebContents(e.sender)
      await launchEmulator(cmd, async () => {
        if (!disk || !win || win.isDestroyed()) return
        // The emulator may have written to the image; tell the renderer to reload it.
        const after = await stat(disk.path).then((s) => s.mtimeMs, () => before)
        if (after !== before) win.webContents.send('emu:diskChanged', opts.diskId)
      })
      return { kind: cmd.kind }
    },
  )
}
