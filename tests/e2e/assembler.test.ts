import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { _electron as electron, type ElectronApplication, type Page } from 'playwright-core'
import { mkdtemp, rm, mkdir, readdir, readFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { getPlugin } from '../../src/main/services/disk-engine'
import { assemble } from '../../src/renderer/lib/lang/assembler'

// Writes assembler source in the real editor, assembles it and checks the program that lands on the disk.
const SHOTS = process.env['E2E_SHOTS'] ?? join(tmpdir(), 'imagine-e2e-shots')
let app: ElectronApplication
let page: Page
let sandbox: string
let imagePath: string
const problems: string[] = []
const d64 = getPlugin('d64')

const SOURCE = ['.basic', ' lda #5', ' sta $d020', ' jmp *']

beforeAll(async () => {
  sandbox = await mkdtemp(join(tmpdir(), 'imagine-e2e-asm-'))
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
    if (!item!.enabled) throw new Error(`menu item disabled: ${path.join(' > ')}`)
    item!.click()
  }, labels)
}

const diskFile = async (name: string) => {
  const disk = await readFile(imagePath)
  return (await d64.listFiles(disk)).some((f) => f.name === name) ? new Uint8Array(await d64.readFile(disk, name)) : null
}

describe('assembler (built app)', () => {
  it('creates an assembler source file', async () => {
    await page.locator('.im-action-card').first().click()
    const primary = page.locator('.im-dialog-footer .im-btn--primary')
    await primary.click()
    await primary.click()
    await page.locator('input.im-input[placeholder="UNTITLED"]').fill('ASMDISK')
    await primary.click()
    await page.waitForSelector('.im-sidebar .im-list-item')
    imagePath = join(sandbox, 'Documents', 'Imagine', (await readdir(join(sandbox, 'Documents', 'Imagine')))[0])

    await clickMenu('Datei', 'Neue Datei…')
    await page.locator('.im-dialog select').selectOption('asm')
    await page.locator('.im-dialog input.im-input').fill('DEMO.ASM')
    await page.locator('.im-dialog-footer .im-btn--primary').click()
    await page.locator('[data-testid="code-editor"]').waitFor()
    expect(await page.locator('.im-btn', { hasText: 'Assemblieren' }).first().isVisible()).toBe(true)
  })

  it('assembles: the PRG on the disk is what the assembler produces for the typed source', async () => {
    await page.locator('.cm-content').click()
    for (const [i, line] of SOURCE.entries()) {
      if (i > 0) await page.keyboard.press('Enter')
      await page.keyboard.type(line)
    }
    await vi.waitFor(async () => expect(await page.locator('.cm-content').innerText()).toContain('jmp *'))
    await page.screenshot({ path: join(SHOTS, 'a1-source.png') })

    await clickMenu('Datei', 'Assemblieren')
    await vi.waitFor(async () => expect(await diskFile('DEMO')).not.toBeNull(), { timeout: 10_000 })
    const expected = assemble(SOURCE.join('\n')).prg!
    expect(Buffer.from((await diskFile('DEMO'))!).toString('hex')).toBe(Buffer.from(expected).toString('hex'))
    // the source itself was saved as a SEQ file next to it
    const files = await d64.listFiles(await readFile(imagePath))
    expect(files.map((f) => `${f.name}:${f.type}`).sort()).toEqual(['DEMO.ASM:SEQ', 'DEMO:PRG'])
    const src = Buffer.from((await diskFile('DEMO.ASM'))!).toString('latin1')
    // the editor keeps the indentation of the previous line, so compare the lines without leading blanks
    expect(src.split(/\r\n|\r|\n/).map((l) => l.trim())).toEqual(SOURCE.map((l) => l.trim()))
    await page.screenshot({ path: join(SHOTS, 'a2-assembled.png') })
  })

  it('assembling again replaces the program instead of adding a second one', async () => {
    await page.locator('.cm-content').click()
    await page.keyboard.press('Control+End')
    await page.keyboard.press('Enter')
    await page.keyboard.type(' nop')
    await clickMenu('Datei', 'Assemblieren')
    const expected = assemble([...SOURCE, ' nop'].join('\n')).prg!
    await vi.waitFor(async () => expect(Buffer.from((await diskFile('DEMO')) ?? []).toString('hex')).toBe(Buffer.from(expected).toString('hex')))
    const names = (await d64.listFiles(await readFile(imagePath))).map((f) => f.name).sort()
    expect(names).toEqual(['DEMO', 'DEMO.ASM'])
  })

  it('shows errors with their line and leaves the last good program alone', async () => {
    const before = Buffer.from((await diskFile('DEMO'))!).toString('hex')
    await page.locator('.cm-content').click()
    await page.keyboard.press('Control+End')
    await page.keyboard.press('Enter')
    await page.keyboard.type(' lda nowhere')
    await vi.waitFor(async () => expect(await page.locator('[data-testid="problems"]').innerText()).toMatch(/Unbekanntes Symbol/))
    await clickMenu('Datei', 'Assemblieren')
    await page.locator('.im-toast', { hasText: 'Assemblieren fehlgeschlagen' }).waitFor({ timeout: 10_000 })
    expect(Buffer.from((await diskFile('DEMO'))!).toString('hex')).toBe(before)
    await page.screenshot({ path: join(SHOTS, 'a3-error.png') })
  })

  it('logged no renderer errors', () => {
    expect(problems).toEqual([])
  })
})
