import { describe, it, expect, vi } from 'vitest'
import type { MenuItemConstructorOptions } from 'electron'
import { buildMenuTemplate, translator, REPO_URL, type MenuContext } from '../../src/main/menu'
import de from '../../src/renderer/i18n/de.json'
import en from '../../src/renderer/i18n/en.json'

function ctx(over: Partial<MenuContext> = {}): MenuContext {
  return {
    t: translator('en'),
    hasDisk: true,
    dirty: false,
    canRun: false,
    canAssemble: false,
    isDev: false,
    platform: 'win32',
    send: vi.fn(),
    openExternal: vi.fn(),
    ...over,
  }
}

function flatten(items: MenuItemConstructorOptions[]): MenuItemConstructorOptions[] {
  return items.flatMap((i) => [i, ...(Array.isArray(i.submenu) ? flatten(i.submenu) : [])])
}
const find = (items: MenuItemConstructorOptions[], label: string) => flatten(items).find((i) => i.label === label)!

describe('native menu', () => {
  it('has the five top-level menus in order', () => {
    const labels = buildMenuTemplate(ctx()).map((m) => m.label)
    expect(labels).toEqual(['File', 'Edit', 'View', 'Tools', 'Help'])
  })

  it('every item has a label (or role/separator) and every label is translated in both languages', () => {
    for (const lang of ['de', 'en'] as const) {
      const items = flatten(buildMenuTemplate(ctx({ t: translator(lang), isDev: true })))
      for (const i of items) {
        if (i.type === 'separator') continue
        expect(i.label, JSON.stringify(i)).toBeTruthy()
        // an untranslated key would be echoed back verbatim, e.g. "miZoomIn"
        expect(i.label).not.toMatch(/^(mi|menu|tab)[A-Z]/)
      }
    }
    expect(Object.keys(de).sort()).toEqual(Object.keys(en).sort())
  })

  it('uses unique accelerators', () => {
    const keys = flatten(buildMenuTemplate(ctx({ isDev: true }))).map((i) => i.accelerator).filter(Boolean)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('disables disk actions while no disk is loaded and enables them with one', () => {
    for (const label of ['Write to loaded disk…', 'Format loaded disk', 'Eject loaded disk', 'Open emulator with loaded disk']) {
      expect(find(buildMenuTemplate(ctx({ hasDisk: false })), label).enabled, label).toBe(false)
      expect(find(buildMenuTemplate(ctx({ hasDisk: true })), label).enabled, label).toBe(true)
    }
    // creating/opening must always work
    expect(find(buildMenuTemplate(ctx({ hasDisk: false })), 'New virtual disk…').enabled).toBe(true)
    expect(find(buildMenuTemplate(ctx({ hasDisk: false })), 'Open virtual disk…').enabled).toBe(true)
  })

  it('forwards clicks as actions', () => {
    const c = ctx()
    const menu = buildMenuTemplate(c)
    ;(find(menu, 'New virtual disk…').click as () => void)()
    ;(find(menu, 'Preferences…').click as () => void)()
    expect(c.send).toHaveBeenNthCalledWith(1, 'newDisk', undefined)
    expect(c.send).toHaveBeenNthCalledWith(2, 'settings', undefined)
  })

  it('opens the project pages in the browser', () => {
    const c = ctx()
    ;(find(buildMenuTemplate(c), 'Imagine on GitHub').click as () => void)()
    expect(c.openExternal).toHaveBeenCalledWith(REPO_URL)
  })

  it('shows developer tools only in development and Quit only off macOS', () => {
    expect(flatten(buildMenuTemplate(ctx({ isDev: false }))).some((i) => i.role === 'toggleDevTools')).toBe(false)
    expect(flatten(buildMenuTemplate(ctx({ isDev: true }))).some((i) => i.role === 'toggleDevTools')).toBe(true)
    expect(flatten(buildMenuTemplate(ctx({ platform: 'win32' }))).some((i) => i.role === 'quit')).toBe(true)
    const mac = buildMenuTemplate(ctx({ platform: 'darwin' }))
    expect(mac[0].role).toBe('appMenu')
    expect(flatten(mac).some((i) => i.role === 'quit')).toBe(false)
  })

  it('localises labels', () => {
    const german = buildMenuTemplate(ctx({ t: translator('de') }))
    expect(german.map((m) => m.label)).toEqual(['Datei', 'Bearbeiten', 'Ansicht', 'Werkzeuge', 'Hilfe'])
    expect(flatten(german).some((i) => i.label === 'Neue virtuelle Diskette…')).toBe(true)
  })

  it('Save, Save and run and Assemble follow the editor state', () => {
    const idle = buildMenuTemplate(ctx())
    expect(find(idle, 'Save').enabled).toBe(false)
    expect(find(idle, 'Save and run').enabled).toBe(false)
    expect(find(idle, 'Assemble').enabled).toBe(false)
    const busy = buildMenuTemplate(ctx({ dirty: true, canRun: true, canAssemble: true }))
    expect(find(busy, 'Save').enabled).toBe(true)
    expect(find(busy, 'Save and run').enabled).toBe(true)
    expect(find(busy, 'Assemble').enabled).toBe(true)
  })

  it('has one owner per key: Save, run, assemble and the older disk actions do not collide', () => {
    const menu = buildMenuTemplate(ctx())
    const key = (label: string) => find(menu, label).accelerator
    expect(key('Save')).toBe('CmdOrCtrl+S')
    expect(key('Save and run')).toBe('F5')
    expect(key('Assemble')).toBe('F7')
    expect(key('Open emulator with loaded disk')).toBe('CmdOrCtrl+F5')
    expect(key('Write to loaded disk…')).toBe('CmdOrCtrl+I')
    expect(key('New file…')).toBe('CmdOrCtrl+Shift+N')
  })
})
