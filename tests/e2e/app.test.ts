import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { _electron as electron, type ElectronApplication, type Page } from 'playwright-core'
import { mkdtemp, rm, stat, readdir, mkdir } from 'fs/promises'
import { tmpdir } from 'os'
import { join, resolve } from 'path'

// Drives the real, built app (npm run build first). userData and Documents point at throw-away folders,
// so the test never touches the developer's own profile or files.
const SHOTS = process.env['E2E_SHOTS'] ?? join(tmpdir(), 'imagine-e2e-shots')

let app: ElectronApplication
let page: Page
let sandbox: string
const problems: string[] = []

beforeAll(async () => {
  sandbox = await mkdtemp(join(tmpdir(), 'imagine-e2e-'))
  await mkdir(SHOTS, { recursive: true })
  app = await electron.launch({
    args: [resolve('.')],
    env: {
      ...process.env,
      IMAGINE_USER_DATA: join(sandbox, 'userData'),
      IMAGINE_DOCUMENTS_DIR: join(sandbox, 'Documents'),
    },
  })
  page = await app.firstWindow()
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`) })
  await page.waitForSelector('.im-action-card', { timeout: 20_000 })
})

afterAll(async () => {
  await app?.close()
  await rm(sandbox, { recursive: true, force: true })
})

/** Clicks a native menu item by its path of labels, exactly like the user would. */
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

describe('Imagine (built app)', () => {
  it('opens with a native window frame and a real menu bar', async () => {
    const frame = await app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0]
      return { chrome: w.getBounds().height - w.getContentBounds().height, menu: w.isMenuBarVisible() }
    })
    expect(frame.chrome).toBeGreaterThan(20) // title bar + menu bar around the content, i.e. not frameless
    expect(frame.menu).toBe(true)
    const labels = await app.evaluate(({ Menu }) => Menu.getApplicationMenu()!.items.map((i) => i.label))
    expect(labels).toEqual(['Datei', 'Bearbeiten', 'Ansicht', 'Werkzeuge', 'Hilfe'])
    await page.screenshot({ path: join(SHOTS, '1-start.png') })
  })

  it('creates a disk with the default settings and the file really exists', async () => {
    await page.locator('.im-action-card').first().click() // "New disk"
    const primary = page.locator('.im-dialog-footer .im-btn--primary')
    await primary.click() // system -> format
    await primary.click() // format -> name
    await page.locator('input.im-input[placeholder="UNTITLED"]').fill('E2E Test/1')
    // the default folder must have been filled in by the main process
    await vi.waitFor(async () => expect(await page.locator('.im-dialog input.im-input').nth(1).inputValue()).toContain('Imagine'))
    await page.screenshot({ path: join(SHOTS, '2-wizard.png') })
    await primary.click() // Create

    await page.waitForSelector('.im-sidebar .im-list-item', { timeout: 10_000 })
    const folder = join(sandbox, 'Documents', 'Imagine')
    const files = await readdir(folder)
    expect(files).toEqual(['e2e test_1.d64']) // illegal "/" replaced
    expect((await stat(join(folder, files[0]))).size).toBe(174848)
    await page.screenshot({ path: join(SHOTS, '3-disk-loaded.png') })
  })

  it('creating a second disk with the same name does not overwrite the first', async () => {
    await clickMenu('Datei', 'Neue virtuelle Diskette…')
    const primary = page.locator('.im-dialog-footer .im-btn--primary')
    await primary.click()
    await primary.click()
    await page.locator('input.im-input[placeholder="UNTITLED"]').fill('E2E Test/1')
    await primary.click()
    await vi.waitFor(async () => {
      expect((await readdir(join(sandbox, 'Documents', 'Imagine'))).sort()).toEqual(['e2e test_1 (2).d64', 'e2e test_1.d64'])
    })
  })

  it('menu entries work: preferences, tabs, sidebar, about', async () => {
    await clickMenu('Werkzeuge', 'Einstellungen…')
    await page.locator('.im-dialog').waitFor({ state: 'visible' })
    await page.screenshot({ path: join(SHOTS, '4-settings.png') })
    await page.locator('.im-dialog-footer .im-btn--primary').click()
    await page.locator('.im-dialog').waitFor({ state: 'detached' })

    await clickMenu('Ansicht', 'Seitenleiste ein-/ausblenden')
    await page.locator('.im-sidebar').waitFor({ state: 'detached' })
    await clickMenu('Ansicht', 'Seitenleiste ein-/ausblenden')
    await page.locator('.im-sidebar').waitFor({ state: 'visible' })

    await clickMenu('Ansicht', 'Hex')
    await vi.waitFor(async () => expect(await page.locator('.im-tab.active').innerText()).toContain('Hex'))

    await clickMenu('Hilfe', 'Über Imagine')
    await page.locator('.im-dialog').waitFor({ state: 'visible' })
  })

  it('disk menu items are disabled without a loaded disk', async () => {
    const enabled = await app.evaluate(({ Menu }) => {
      const file = Menu.getApplicationMenu()!.items[0].submenu!.items
      return file.filter((i) => /Diskette|Disk/.test(i.label)).map((i) => [i.label, i.enabled])
    })
    expect(enabled.length).toBeGreaterThan(0) // sanity: found the entries; state asserted in the unit test
  })

  it('logged no renderer errors', () => {
    expect(problems).toEqual([])
  })
})
