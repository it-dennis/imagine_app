// Regenerates tests/fixtures/oracle/basic-<dialect>.prg with VICE's petcat from basic-corpus.json.
// The fixtures are committed so the suite checks our tokenizer against petcat's output even where VICE is absent.
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DIR = join(ROOT, 'tests/fixtures/oracle')
const PETCAT = [process.env.IMAGINE_VICE_DIR, 'C:\\Program Files\\Vice', 'C:\\Program Files\\GTK3VICE', '/usr/bin', '/usr/local/bin']
  .filter(Boolean)
  .map((d) => join(d, process.platform === 'win32' ? 'petcat.exe' : 'petcat'))
  .find(existsSync)
if (!PETCAT) {
  console.error('petcat not found (set IMAGINE_VICE_DIR)')
  process.exit(2)
}

const corpus = JSON.parse(readFileSync(join(DIR, 'basic-corpus.json'), 'utf-8'))
const VERSION = { v2: '2', v35: '3', v70: '70' }
const tmp = mkdtempSync(join(tmpdir(), 'gen-fixtures-'))
for (const [id, lines] of Object.entries(corpus)) {
  const src = join(tmp, `${id}.txt`)
  const out = join(DIR, `basic-${id}.prg`)
  writeFileSync(src, lines.join('\n') + '\n')
  spawnSync(PETCAT, [`-w${VERSION[id]}`, '-f', '-o', out, '--', src])
  console.log(`wrote ${out}`)
}
rmSync(tmp, { recursive: true, force: true })
