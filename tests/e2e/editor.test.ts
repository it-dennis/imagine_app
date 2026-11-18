import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { _electron as electron, type ElectronApplication, type Page } from 'playwright-core'
import { mkdtemp, rm, mkdir, readdir, readFile, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { getPlugin } from '../../src/main/services/disk-engine'
import { DIALECTS, tokenize } from '../../src/renderer/lib/lang/basic'

// Drives the built app through the editor: create a BASIC file, type, save, reload from disk, conflicts, close guard.
const SHOTS = process.env['E2E_SHOTS'] ?? join(tmpdir(), 'imagine-e2e-shots')
let app: ElectronApplication
let page: Page
let sandbox: string
let imagePath: string
const problems: string[] = []
const d64 = getPlugin('d64')

beforeAll(async () => {
  sandbox = await mkdtemp(join(tmpdir(), 'imagine-e2e-editor-'))
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

const menuState = (...labels: string[]) =>
  app.evaluate(({ Menu }, path) => {
    let items = Menu.getApplicationMenu()!.items
    let item: Electron.MenuItem | undefined
    for (const label of path) { item = items.find((i) => i.label === label); items = item?.submenu?.items ?? [] }
    return item?.enabled ?? null
  }, labels)

const editorText = () => page.locator('.cm-content').innerText()
const imageFile = async (name: string) => {
  const disk = await readFile(imagePath)
  const entry = (await d64.listFiles(disk)).find((f) => f.name === name)
  return entry ? new Uint8Array(await d64.readFile(disk, name)) : null
}
const typeInto = async (text: string) => {
  await page.locator('.cm-content').click()
  await page.keyboard.press('Control+End')
  await page.keyboard.type(text)
}

describe('editor (built app)', () => {
  it('creates a disk and a new BASIC file', async () => {
    await page.locator('.im-action-card').first().click()
    const primary = page.locator('.im-dialog-footer .im-btn--primary')
    await primary.click()
    await primary.click()
    await page.locator('input.im-input[placeholder="UNTITLED"]').fill('EDITDISK')
    await primary.click()
    await page.waitForSelector('.im-sidebar .im-list-item')
    imagePath = join(sandbox, 'Documents', 'Imagine', (await readdir(join(sandbox, 'Documents', 'Imagine')))[0])

    expect(await menuState('Datei', 'Speichern')).toBe(false) // nothing to save yet
    await clickMenu('Datei', 'Neue Datei…')
    await page.locator('.im-dialog input.im-input').fill('HELLO')
    await page.locator('.im-dialog-footer .im-btn--primary').click()
    await page.locator('[data-testid="code-editor"]').waitFor()
    await page.screenshot({ path: join(SHOTS, 'e1-new-file.png') })
  })

  it('typing marks the document modified and enables Save', async () => {
    await typeInto('10 print "hello {clr}"')
    await page.keyboard.press('Enter')
    await page.keyboard.type('20 goto 10')
    await vi.waitFor(async () => expect(await menuState('Datei', 'Speichern')).toBe(true))
    expect(await menuState('Datei', 'Speichern und ausführen')).toBe(true)
    await page.screenshot({ path: join(SHOTS, 'e2-typed.png') })
  })

  it('saves: the PRG on the disk is exactly what the tokenizer produces', async () => {
    await clickMenu('Datei', 'Speichern')
    await vi.waitFor(async () => expect(await imageFile('HELLO')).not.toBeNull())
    const expected = tokenize('10 print "hello {clr}"\n20 goto 10', DIALECTS.v2).prg
    expect(Buffer.from((await imageFile('HELLO'))!).toString('hex')).toBe(Buffer.from(expected).toString('hex'))
    await vi.waitFor(async () => expect(await menuState('Datei', 'Speichern')).toBe(false)) // clean again
    await page.screenshot({ path: join(SHOTS, 'e3-saved.png') })
  })

  it('a second save replaces the file in place and does not duplicate it', async () => {
    await typeInto('\n30 end')
    await clickMenu('Datei', 'Speichern')
    const expected = tokenize('10 print "hello {clr}"\n20 goto 10\n30 end', DIALECTS.v2).prg
    await vi.waitFor(async () => expect(Buffer.from((await imageFile('HELLO')) ?? []).toString('hex')).toBe(Buffer.from(expected).toString('hex')))
    const names = (await d64.listFiles(await readFile(imagePath))).map((f) => f.name)
    expect(names).toEqual(['HELLO'])
  })

  it('reopening from the file list shows what is on the disk', async () => {
    await page.locator('.im-btn', { hasText: 'Schließen' }).click() // close the document, then open it from the disk
    await page.locator('.im-tab', { hasText: 'Dateien' }).click()
    await page.locator('.im-table tbody tr', { hasText: 'HELLO' }).dblclick()
    await vi.waitFor(async () => expect(await editorText()).toContain('30 END'))
    const text = await editorText()
    expect(text).toContain('10 PRINT "HELLO {clr}"') // control code shown by name, keywords expanded
  })

  it('refuses to overwrite when the file changed on the disk meanwhile, and keeps their data', async () => {
    // someone else (e.g. an emulator) rewrites the file in the image
    const disk = await readFile(imagePath)
    const ref = (await d64.listFiles(disk))[0]
    const theirs = Buffer.from(tokenize('10 print "from outside"', DIALECTS.v2).prg)
    const { replaceFileEntry } = await import('../../src/main/services/disk-engine')
    const { buffer } = await replaceFileEntry(d64, disk, ref, theirs)
    await writeFile(imagePath, buffer)

    await typeInto('\n40 rem mine')
    await clickMenu('Datei', 'Speichern')
    await page.locator('text=changed since you opened it').or(page.locator('text=geändert')).first().waitFor({ timeout: 10_000 })
    expect(Buffer.from((await imageFile('HELLO'))!).toString('hex')).toBe(theirs.toString('hex')) // untouched
    await page.screenshot({ path: join(SHOTS, 'e4-conflict.png') })

    await page.locator('.im-btn', { hasText: 'Neu laden' }).click()
    await vi.waitFor(async () => expect(await editorText()).toContain('FROM OUTSIDE'))
  })

  it('opens machine code behind a BASIC program read-only instead of risking it', async () => {
    const disk = await readFile(imagePath)
    const ref = (await d64.listFiles(disk))[0]
    const base = tokenize('10 sys 2064', DIALECTS.v2).prg
    const withMl = Buffer.from([...base, 0xa9, 0x00, 0x60])
    const { replaceFileEntry } = await import('../../src/main/services/disk-engine')
    await writeFile(imagePath, (await replaceFileEntry(d64, disk, ref, withMl)).buffer)
    await page.locator('.im-btn', { hasText: 'Schließen' }).click()
    await page.locator('.im-tab', { hasText: 'Dateien' }).click()
    await page.locator('.im-table tbody tr', { hasText: 'HELLO' }).dblclick()
    await page.locator('text=weitere Bytes').waitFor({ timeout: 10_000 })
    await page.screenshot({ path: join(SHOTS, 'e5-readonly.png') })
    expect(await page.locator('.im-btn--primary', { hasText: 'Speichern' }).isDisabled()).toBe(true)
  })

  it('keeps the window open while there are unsaved changes (Cancel) and closes on Discard', async () => {
    await page.locator('.im-tab', { hasText: 'Text' }).click()
    await page.locator('.im-tab', { hasText: 'Dateien' }).click()
    // a text document that is modified
    await clickMenu('Datei', 'Neue Datei…')
    await page.locator('.im-dialog select').selectOption('text')
    await page.locator('.im-dialog input.im-input').fill('NOTES')
    await page.locator('.im-dialog-footer .im-btn--primary').click()
    await typeInto('unsaved words')
    await vi.waitFor(async () => expect(await menuState('Datei', 'Speichern')).toBe(true))

    const answer = (n: number) => app.evaluate(({ dialog }, choice) => { dialog.showMessageBoxSync = () => choice }, n)
    const windowCount = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)

    await answer(2) // Cancel
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close())
    await new Promise((r) => setTimeout(r, 500))
    expect(await windowCount()).toBe(1)

    await answer(1) // Discard: the window closes and, as the last one, ends the app
    const exited = new Promise<void>((resolve) => app.process().once('exit', () => resolve()))
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close())
    await Promise.race([exited, new Promise((_, reject) => setTimeout(() => reject(new Error('app did not exit')), 15_000))])
  })

  it('logged no renderer errors', () => {
    expect(problems).toEqual([])
  })
})
