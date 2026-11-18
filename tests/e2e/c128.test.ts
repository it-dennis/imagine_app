import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { _electron as electron, type ElectronApplication, type Page } from 'playwright-core'
import { mkdtemp, rm, mkdir, readdir, readFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { getPlugin } from '../../src/main/services/disk-engine'
import { DIALECTS, tokenize } from '../../src/renderer/lib/lang/basic'
import { c1541, C1541 } from '../helpers/vice'

// A C128 disk (D71) with a BASIC 7.0 program, created and saved through the real UI.
const SHOTS = process.env['E2E_SHOTS'] ?? join(tmpdir(), 'imagine-e2e-shots')
let app: ElectronApplication
let page: Page
let sandbox: string
let imagePath: string
const problems: string[] = []
const d71 = getPlugin('d71')

beforeAll(async () => {
  sandbox = await mkdtemp(join(tmpdir(), 'imagine-e2e-c128-'))
  await mkdir(SHOTS, { recursive: true })
  app = await electron.launch({
    args: [resolve('.')],
    env: { ...process.env, IMAGINE_USER_DATA: join(sandbox, 'userData'), IMAGINE_DOCUMENTS_DIR: join(sandbox, 'Documents') },
  })
  page = await app.firstWindow()
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`) })
  await page.waitForSelector('.im-action-card', { timeout: 20_000 })
})

afterAll(async () => {
  await app?.close().catch(() => {})
  await rm(sandbox, { recursive: true, force: true })
})

async function clickMenu(...labels: string[]): Promise<void> {
  await app.evaluate(({ Menu }, path) => {
    let items = Menu.getApplicationMenu()!.items
    let item: Electron.MenuItem | undefined
    for (const label of path) {
      item = items.find((i) => i.label === label)
      if (!item) throw new Error(`menu item not found: ${label}`)
      items = item.submenu?.items ?? []
    }
    item!.click()
  }, labels)
}

describe('C128 disk with BASIC 7.0 (built app)', () => {
  it('the wizard offers the C128 with D64, D71 and D81 and creates a D71', async () => {
    await page.locator('.im-action-card').first().click()
    const primary = page.locator('.im-dialog-footer .im-btn--primary')
    await page.locator('.im-badge', { hasText: 'Commodore 128' }).click()
    await primary.click()
    const offered = await page.locator('.im-dialog .im-badge').allInnerTexts()
    expect(offered.map((t) => t.split(' ')[0].toLowerCase())).toEqual(['.d64', '.d71', '.d81'])
    await page.locator('.im-dialog .im-badge', { hasText: '.d71' }).click()
    await primary.click()
    await page.locator('input.im-input[placeholder="UNTITLED"]').fill('C128DISK')
    await primary.click()
    await page.waitForSelector('.im-sidebar .im-list-item')
    imagePath = join(sandbox, 'Documents', 'Imagine', (await readdir(join(sandbox, 'Documents', 'Imagine')))[0])
    expect(imagePath.endsWith('.d71')).toBe(true)
    expect((await readFile(imagePath)).length).toBe(349696)
    await page.screenshot({ path: join(SHOTS, 'c1-wizard-d71.png') })
  })

  it('a new BASIC file on a C128 disk defaults to BASIC 7.0 and saves a $1C01 program', async () => {
    await clickMenu('Datei', 'Neue Datei…')
    await page.locator('.im-dialog input.im-input').fill('HELLO128')
    await page.locator('.im-dialog-footer .im-btn--primary').click()
    await page.locator('[data-testid="code-editor"]').waitFor()
    expect(await page.locator('select.im-input').inputValue()).toBe('v70')
    await page.locator('.cm-content').click()
    await page.keyboard.type('10 do:a=a+1:loop until a=5')
    await page.keyboard.press('Enter')
    await page.keyboard.type('20 print "c128";hex$(255)')
    await clickMenu('Datei', 'Speichern')

    const expected = tokenize('10 do:a=a+1:loop until a=5\n20 print "c128";hex$(255)', DIALECTS.v70).prg
    await vi.waitFor(async () => {
      const disk = await readFile(imagePath)
      expect((await d71.listFiles(disk)).map((f) => f.name)).toEqual(['HELLO128'])
      expect(Buffer.from(await d71.readFile(disk, 'HELLO128')).toString('hex')).toBe(Buffer.from(expected).toString('hex'))
    })
    expect(expected[0] | (expected[1] << 8)).toBe(0x1c01)
    await page.screenshot({ path: join(SHOTS, 'c2-basic70.png') })
  })

  it.skipIf(!C1541)('c1541 sees the file the app saved and finds the disk consistent', async () => {
    const out = c1541('-attach', imagePath, '-dir')
    expect(out).toMatch(/"HELLO128\s*"\s+prg/i)
    const before = await readFile(imagePath)
    c1541('-attach', imagePath, '-validate')
    expect((await readFile(imagePath)).equals(before)).toBe(true)
  })

  it('logged no renderer errors', () => {
    expect(problems).toEqual([])
  })
})
