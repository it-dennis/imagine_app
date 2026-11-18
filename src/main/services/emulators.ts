import { spawn } from 'child_process'
import { access, readdir } from 'fs/promises'
import { constants } from 'fs'
import { homedir } from 'os'
import { delimiter, dirname, extname, join } from 'path'
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
  /** Name of the file to run; without it VICE starts the first program on the disk. */
  program?: string
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
  c128: 'x128',
}

export function emulatorFor(system: System): EmulatorKind {
  if (system in VICE_BINARY) return 'vice'
  if (system === 'atariST') return 'hatari'
  throw new Error(`No emulator integration for this system yet (${system}).`)
}

/**
 * "image:name" makes VICE load that file instead of the first one. VICE converts the name from ASCII, where
 * capitals count as shifted PETSCII letters, so names are passed in lowercase (checked against a real ROM run).
 * Names with other characters cannot be passed reliably; then the first program starts.
 */
export function autostartTarget(diskPath: string, program?: string): string {
  if (program && /^[A-Za-z0-9 _.+-]{1,16}$/.test(program)) return `${diskPath}:${program.toLowerCase()}`
  return diskPath
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
  if (!req.hasFiles) return { kind, command, args: ['-8', req.diskPath] }
  return { kind, command, args: ['-autostart', autostartTarget(req.diskPath, req.program)] }
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

export interface DetectOptions {
  platform?: NodeJS.Platform
  env?: NodeJS.ProcessEnv
  home?: string
  /** Replaces the default install locations (the PATH is always searched too). Used by tests. */
  roots?: string[]
}

const exists = (p: string) => access(p, constants.F_OK).then(() => true, () => false)

function defaultRoots(platform: NodeJS.Platform, env: NodeJS.ProcessEnv, home: string): string[] {
  const portable = [join(home, 'Downloads'), join(home, 'Desktop'), join(home, 'Documents')]
  if (platform === 'win32') {
    const drive = env.SystemDrive ?? 'C:'
    return [
      env.ProgramFiles ?? `${drive}\\Program Files`,
      env['ProgramFiles(x86)'] ?? `${drive}\\Program Files (x86)`,
      env.LOCALAPPDATA ? join(env.LOCALAPPDATA, 'Programs') : '',
      `${drive}\\`,
      `${drive}\\Tools`,
      `${drive}\\Emulators`,
      ...portable,
    ].filter(Boolean)
  }
  if (platform === 'darwin') return ['/Applications', '/opt/homebrew/bin', '/usr/local/bin', ...portable]
  return ['/usr/bin', '/usr/games', '/usr/local/bin', '/usr/local/games', '/opt', ...portable]
}

/** Candidate executable locations inside one directory (flat, in bin/, or in a macOS app bundle). */
function candidates(dir: string, binary: string, platform: NodeJS.Platform): string[] {
  const exe = platform === 'win32' ? `${binary}.exe` : binary
  const list = [join(dir, exe), join(dir, 'bin', exe)]
  if (platform === 'darwin') {
    list.push(join(dir, `${binary}.app`, 'Contents', 'MacOS', binary), join(dir, 'Contents', 'MacOS', binary))
  }
  return list
}

async function findIn(roots: string[], binary: string, folder: RegExp, platform: NodeJS.Platform): Promise<string | undefined> {
  for (const root of roots) {
    const dirs = [root]
    try {
      const entries = await readdir(root, { withFileTypes: true })
      // Newest-looking version first (e.g. GTK3VICE-3.9 before GTK3VICE-3.7).
      const matches = entries.filter((e) => e.isDirectory() && folder.test(e.name)).map((e) => join(root, e.name))
      dirs.push(...matches.sort().reverse())
    } catch { /* root does not exist */ }
    for (const dir of dirs) {
      for (const c of candidates(dir, binary, platform)) if (await exists(c)) return c
    }
  }
  return undefined
}

/** Looks for VICE (x64sc) and Hatari on the PATH and in the usual install / unpack locations. */
export async function detectEmulators(opts: DetectOptions = {}): Promise<EmulatorPrefs> {
  const platform = opts.platform ?? process.platform
  const env = opts.env ?? process.env
  const pathDirs = (env.PATH ?? env.Path ?? '').split(delimiter).filter(Boolean)
  const roots = [...pathDirs, ...(opts.roots ?? defaultRoots(platform, env, opts.home ?? homedir()))]
  const found: EmulatorPrefs = {}
  const vicePath = await findIn(roots, 'x64sc', /vice/i, platform)
  const hatariPath = await findIn(roots, 'hatari', /hatari/i, platform)
  if (vicePath) found.vicePath = vicePath
  if (hatariPath) found.hatariPath = hatariPath
  return found
}
