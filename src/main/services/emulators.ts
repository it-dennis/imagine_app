import { spawn } from 'child_process'
import { access } from 'fs/promises'
import { constants } from 'fs'
import { dirname, extname, join } from 'path'
import type { System } from '../../shared/types'

export type EmulatorKind = 'vice' | 'hatari'

export interface EmulatorPrefs {
  vicePath?: string
  hatariPath?: string
}

export interface LaunchRequest {
  system: System
  /** Disk image to attach; omitted for a blank emulator session. */
  diskPath?: string
  /** Whether the image holds at least one file (autostart needs one). */
  hasFiles?: boolean
}

export interface LaunchCommand {
  kind: EmulatorKind
  command: string
  args: string[]
}

// The VICE path in the prefs points at the C64 binary (x64sc); the VIC-20 and Plus/4 binaries live next to it.
const VICE_BINARY: Partial<Record<System, string>> = {
  c64: 'x64sc',
  vic20: 'xvic',
  plus4: 'xplus4',
}

export function emulatorFor(system: System): EmulatorKind {
  if (system in VICE_BINARY) return 'vice'
  if (system === 'atariST') return 'hatari'
  throw new Error(`No emulator integration for this system yet (${system}).`)
}

export function buildLaunchCommand(req: LaunchRequest, prefs: EmulatorPrefs): LaunchCommand {
  const kind = emulatorFor(req.system)

  if (kind === 'hatari') {
    const command = prefs.hatariPath?.trim()
    if (!command) throw new Error('Hatari path is not set. Configure it under Settings → Emulator.')
    return { kind, command, args: req.diskPath ? ['--disk-a', req.diskPath] : [] }
  }

  const configured = prefs.vicePath?.trim()
  if (!configured) throw new Error('VICE path is not set. Configure it under Settings → Emulator.')
  const binary = VICE_BINARY[req.system]!
  const command = binary === 'x64sc' ? configured : join(dirname(configured), binary + extname(configured))
  if (!req.diskPath) return { kind, command, args: [] }
  // -autostart runs the first program, which fails on an empty directory, so only attach (-8) then.
  return { kind, command, args: req.hasFiles ? ['-autostart', req.diskPath] : ['-8', req.diskPath] }
}

/** Starts the emulator detached from Imagine. Resolves once it has spawned; `onExit` fires when it quits. */
export async function launchEmulator(cmd: LaunchCommand, onExit?: () => void): Promise<void> {
  try {
    await access(cmd.command, constants.F_OK)
  } catch {
    throw new Error(`Emulator not found: ${cmd.command}`)
  }
  await new Promise<void>((resolve, reject) => {
    const child = spawn(cmd.command, cmd.args, {
      cwd: dirname(cmd.command),
      detached: true,
      stdio: 'ignore',
    })
    child.once('error', (err) => reject(new Error(`Could not start ${cmd.kind}: ${err.message}`)))
    child.once('spawn', () => {
      if (onExit) child.once('exit', onExit)
      child.unref()
      resolve()
    })
  })
}
