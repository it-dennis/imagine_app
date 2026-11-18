import { spawnSync } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'

// Independent oracles shipped with VICE: c1541 (disk images) and petcat (BASIC tokenizer).
// Tests that use them are skipped on machines without VICE, so the suite stays green everywhere;
// the committed fixtures under tests/fixtures keep the important results checked in.

const CANDIDATES = [
  process.env['IMAGINE_VICE_DIR'],
  'C:\\Program Files\\Vice',
  'C:\\Program Files\\GTK3VICE',
  '/usr/bin',
  '/usr/local/bin',
  '/usr/games',
].filter((d): d is string => !!d)

const exe = (name: string) => (process.platform === 'win32' ? `${name}.exe` : name)

function find(name: string): string | null {
  for (const dir of CANDIDATES) {
    const p = join(dir, exe(name))
    if (existsSync(p)) return p
  }
  return null
}

export const C1541 = find('c1541')
export const PETCAT = find('petcat')

function run(tool: string, args: string[]): { stdout: Buffer; stderr: string; status: number | null } {
  const r = spawnSync(tool, args, { encoding: 'buffer', windowsHide: true })
  return { stdout: r.stdout, stderr: r.stderr.toString('latin1'), status: r.status }
}

/** Runs c1541 with the given arguments (e.g. ['-attach', img, '-dir']) and returns its output text. */
export function c1541(...args: string[]): string {
  if (!C1541) throw new Error('c1541 not available')
  const r = run(C1541, args)
  return r.stdout.toString('latin1') + r.stderr
}

/** Runs petcat; returns raw stdout bytes. */
export function petcat(...args: string[]): Buffer {
  if (!PETCAT) throw new Error('petcat not available')
  return run(PETCAT, args).stdout
}
