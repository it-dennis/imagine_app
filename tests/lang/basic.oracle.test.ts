import { describe, it, expect } from 'vitest'
import { mkdtemp, writeFile, readFile, rm } from 'fs/promises'
import { spawnSync } from 'child_process'
import { tmpdir } from 'os'
import { join } from 'path'
import { petcat, PETCAT } from '../helpers/vice'
import { DIALECTS, checkRoundTrip, tokenize, type DialectId } from '../../src/renderer/lib/lang/basic'
import { DIALECT_DATA } from '../../src/renderer/lib/lang/basic-tokens'

// Live comparison with VICE's petcat. Skipped where VICE is not installed; the committed fixtures
// (basic.test.ts) keep the result checked in everywhere.
const VERSION: Record<DialectId, string> = { v2: '2', v35: '3', v70: '70' }

async function petcatTokenize(id: DialectId, lines: string[]): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), 'petcat-'))
  try {
    await writeFile(join(dir, 'in.txt'), lines.join('\n') + '\n')
    petcat(`-w${VERSION[id]}`, '-f', '-o', join(dir, 'out.prg'), '--', join(dir, 'in.txt'))
    return await readFile(join(dir, 'out.prg'))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

describe.skipIf(!PETCAT)('tokenizer vs petcat', () => {
  it('the generated token tables are up to date with this petcat', () => {
    const r = spawnSync(process.execPath, ['scripts/gen-basic-tokens.mjs', '--check'], { encoding: 'utf-8' })
    expect(r.stdout + r.stderr).toMatch(/up to date/)
  })

  for (const id of ['v2', 'v35', 'v70'] as const) {
    it(`${id}: every single keyword tokenizes exactly like petcat`, async () => {
      const d = DIALECTS[id]
      const keywords = DIALECT_DATA[id].tokens.map((t) => t.text).filter((t) => t !== '\u03c0' && t !== '~')
      const lines = keywords.map((k, i) => `${(i + 1) * 10} ${k.toLowerCase()}`)
      const theirs = await petcatTokenize(id, lines)
      const mine = Buffer.from(tokenize(lines.join('\n'), d).prg)
      expect(mine.toString('hex')).toBe(theirs.toString('hex'))
    })

    it(`${id}: petcat-made programs round-trip through the editor text`, async () => {
      const corpus = JSON.parse(await readFile(join(__dirname, '..', 'fixtures', 'oracle', 'basic-corpus.json'), 'utf-8'))
      const theirs = await petcatTokenize(id, corpus[id])
      const rt = checkRoundTrip(new Uint8Array(theirs), DIALECTS[id])
      expect(rt.problem).toBeUndefined()
    })
  }
})
