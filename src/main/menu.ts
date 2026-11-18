import type { BrowserWindow, MenuItemConstructorOptions } from 'electron'
import type { MenuAction } from '../shared/types'
import de from '../renderer/i18n/de.json'
import en from '../renderer/i18n/en.json'

export type MenuLanguage = 'de' | 'en'

const DICTS: Record<MenuLanguage, Record<string, string>> = { de, en }

export const translator = (lang: MenuLanguage) => (key: string): string => DICTS[lang][key] ?? DICTS.de[key] ?? key

export interface MenuContext {
  t: (key: string) => string
  hasDisk: boolean
  /** The editor holds unsaved changes. */
  dirty: boolean
  /** The open document is a runnable program on a CBM disk. */
  canRun: boolean
  /** The open document is assembler source on a CBM disk. */
  canAssemble: boolean
  isDev: boolean
  platform: NodeJS.Platform
  /** Forwards an app-level action to the renderer. */
  send: (action: MenuAction, win?: BrowserWindow) => void
  openExternal: (url: string) => void
}

export const REPO_URL = 'https://github.com/it-dennis/imagine_app'
export const LICENSE_URL = 'https://www.gnu.org/licenses/gpl-3.0.html'

/** Native application menu. Pure: all side effects go through the context so it can be unit-tested. */
export function buildMenuTemplate(ctx: MenuContext): MenuItemConstructorOptions[] {
  const { t, send, hasDisk, dirty, canRun, canAssemble } = ctx
  const action = (label: string, id: MenuAction, accelerator?: string, enabled = true): MenuItemConstructorOptions => ({
    label,
    accelerator,
    enabled,
    click: (_item, win) => send(id, win),
  })
  const sep: MenuItemConstructorOptions = { type: 'separator' }

  const file: MenuItemConstructorOptions[] = [
    action(t('miNewDisk'), 'newDisk', 'CmdOrCtrl+N'),
    action(t('miOpenDisk'), 'openDisk', 'CmdOrCtrl+O'),
    sep,
    action(t('miNewFile'), 'newFile', 'CmdOrCtrl+Shift+N', hasDisk),
    action(t('miSave'), 'save', 'CmdOrCtrl+S', dirty),
    action(t('miSaveRun'), 'saveRun', 'F5', canRun),
    action(t('miAssemble'), 'assemble', 'F7', canAssemble),
    sep,
    action(t('miWriteToDisk'), 'writeFile', 'CmdOrCtrl+I', hasDisk),
    action(t('miFormatDisk'), 'format', undefined, hasDisk),
    action(t('miEjectDisk'), 'eject', 'CmdOrCtrl+W', hasDisk),
    sep,
    action(t('miCreateIso'), 'iso', 'CmdOrCtrl+Shift+I'),
  ]
  if (ctx.platform !== 'darwin') file.push(sep, { label: t('miQuit'), role: 'quit' })

  const tabs: MenuItemConstructorOptions[] = [
    action(t('tabFiles'), 'tabFiles', 'CmdOrCtrl+1', hasDisk),
    action(t('tabBasic'), 'tabBasic', 'CmdOrCtrl+2', hasDisk),
    action(t('tabAsm'), 'tabAsm', 'CmdOrCtrl+3', hasDisk),
    action(t('tabText'), 'tabText', 'CmdOrCtrl+4', hasDisk),
    action(t('tabHex'), 'tabHex', 'CmdOrCtrl+5', hasDisk),
  ]

  const view: MenuItemConstructorOptions[] = [
    action(t('miToggleSidebar'), 'toggleSidebar', 'CmdOrCtrl+B', hasDisk),
    sep,
    ...tabs,
    sep,
    { label: t('miZoomIn'), role: 'zoomIn' },
    { label: t('miZoomOut'), role: 'zoomOut' },
    { label: t('miZoomReset'), role: 'resetZoom' },
    sep,
    { label: t('miFullscreen'), role: 'togglefullscreen' },
  ]
  if (ctx.isDev) view.push(sep, { label: t('miDevTools'), role: 'toggleDevTools' })

  const template: MenuItemConstructorOptions[] = []
  if (ctx.platform === 'darwin') template.push({ role: 'appMenu' })
  template.push(
    { label: t('menuFile'), submenu: file },
    {
      label: t('menuEdit'),
      submenu: [
        { label: t('miUndo'), role: 'undo' },
        { label: t('miRedo'), role: 'redo' },
        sep,
        { label: t('miCut'), role: 'cut' },
        { label: t('miCopy'), role: 'copy' },
        { label: t('miPaste'), role: 'paste' },
        { label: t('miSelectAll'), role: 'selectAll' },
      ],
    },
    { label: t('menuView'), submenu: view },
    {
      label: t('menuTools'),
      submenu: [
        action(t('miOpenInVice'), 'emulatorDisk', 'CmdOrCtrl+F5', hasDisk),
        action(t('miBlankVice'), 'emulatorBlank', 'Shift+F5'),
        action(t('miDetectEmu'), 'detectEmulators'),
        sep,
        action(t('miPreferences'), 'settings', 'CmdOrCtrl+,'),
      ],
    },
    {
      label: t('menuHelp'),
      submenu: [
        action(t('miAbout'), 'about', 'F1'),
        sep,
        { label: t('miGithub'), click: () => ctx.openExternal(REPO_URL) },
        { label: t('miReportIssue'), click: () => ctx.openExternal(`${REPO_URL}/issues`) },
        { label: t('miLicense'), click: () => ctx.openExternal(LICENSE_URL) },
      ],
    },
  )
  return template
}
