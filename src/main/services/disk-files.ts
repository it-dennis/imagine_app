import { mkdir, writeFile } from 'fs/promises'
import { homedir } from 'os'
import { join } from 'path'

const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i

/** The folder new images go to when the user did not pick one. */
export function defaultFolder(documentsDir: string): string {
  return join(documentsDir, 'Imagine')
}

/** Turns what the user typed (empty, "~/…", relative) into an absolute-ish folder path. */
export function resolveFolder(input: string, documentsDir: string, home = homedir()): string {
  const trimmed = input.trim()
  if (!trimmed) return defaultFolder(documentsDir)
  if (trimmed === '~') return home
  if (/^~[\\/]/.test(trimmed)) return join(home, trimmed.slice(2))
  return trimmed
}

/** Disk labels may contain characters Windows forbids in file names (e.g. "GAMES/1"). */
export function sanitizeFileName(label: string): string {
  const cleaned = label
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/[. ]+$/, '')
    .trim()
  if (!cleaned) return 'untitled'
  return RESERVED.test(cleaned) ? `_${cleaned}` : cleaned
}

/**
 * Writes `data` to a new file in `folder` (created if missing) and never overwrites:
 * an existing "name.ext" leads to "name (2).ext", "name (3).ext", …
 */
export async function writeNewFile(folder: string, baseName: string, ext: string, data: Buffer): Promise<string> {
  await mkdir(folder, { recursive: true })
  for (let n = 1; n <= 999; n++) {
    const path = join(folder, `${baseName}${n === 1 ? '' : ` (${n})`}.${ext}`)
    try {
      await writeFile(path, data, { flag: 'wx' })
      return path
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err
    }
  }
  throw new Error(`Too many files named "${baseName}.${ext}" in ${folder}.`)
}
