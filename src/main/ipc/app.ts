import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron'
import { buildMenuTemplate, translator, type MenuLanguage } from '../menu'
import { readPrefs } from './prefs'

interface AppState {
  hasDisk: boolean
  language: MenuLanguage
  dirty: boolean
  canRun: boolean
  canAssemble: boolean
}
let state: AppState = { hasDisk: false, language: 'de', dirty: false, canRun: false, canAssemble: false }
const forceClose = new WeakSet<BrowserWindow>()

function rebuildMenu(): void {
  const menu = Menu.buildFromTemplate(
    buildMenuTemplate({
      t: translator(state.language),
      hasDisk: state.hasDisk,
      dirty: state.dirty,
      canRun: state.canRun,
      canAssemble: state.canAssemble,
      isDev: !app.isPackaged,
      platform: process.platform,
      send: (action, win) =>
        (win ?? BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0])?.webContents.send('menu:action', action),
      openExternal: (url) => void shell.openExternal(url),
    }),
  )
  Menu.setApplicationMenu(menu)
}

export async function registerAppHandlers(): Promise<void> {
  const prefs = await readPrefs()
  if (prefs.language === 'en' || prefs.language === 'de') state.language = prefs.language
  rebuildMenu()

  // The renderer tells us what the menu needs to know (is a disk loaded, which language).
  ipcMain.handle('app:setState', (_e, next: AppState) => {
    const merged: AppState = { ...next, language: next.language === 'en' ? 'en' : 'de' }
    const changed = (Object.keys(merged) as (keyof AppState)[]).some((k) => merged[k] !== state[k])
    state = merged
    if (changed) rebuildMenu()
  })

  /** Asks what to do with unsaved changes; the renderer performs the save itself. */
  ipcMain.handle('app:confirmUnsaved', async (e, name: string): Promise<'save' | 'discard' | 'cancel'> => {
    const t = translator(state.language)
    const win = BrowserWindow.fromWebContents(e.sender) ?? undefined
    const options = {
      type: 'warning' as const,
      title: t('edUnsavedTitle'),
      message: t('edUnsavedBody').replace('{{name}}', name),
      buttons: [t('edBtnSave'), t('edBtnDiscard'), t('btnCancel')],
      defaultId: 0,
      cancelId: 2,
      noLink: true,
    }
    const { response } = win ? await dialog.showMessageBox(win, options) : await dialog.showMessageBox(options)
    return response === 0 ? 'save' : response === 1 ? 'discard' : 'cancel'
  })

  ipcMain.handle('app:closeNow', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (win) {
      forceClose.add(win)
      win.close()
    }
  })
  ipcMain.handle('app:info', () => ({ version: app.getVersion() }))
}

/** Keeps the window open while the editor has unsaved changes and lets the user decide. */
export function guardWindowClose(win: BrowserWindow): void {
  win.on('close', (event) => {
    if (forceClose.has(win) || !state.dirty) return
    event.preventDefault()
    const t = translator(state.language)
    const response = dialog.showMessageBoxSync(win, {
      type: 'warning',
      title: t('edUnsavedTitle'),
      message: t('edUnsavedBodyApp'),
      buttons: [t('edBtnSave'), t('edBtnDiscard'), t('btnCancel')],
      defaultId: 0,
      cancelId: 2,
      noLink: true,
    })
    if (response === 1) {
      forceClose.add(win)
      win.close()
    } else if (response === 0) {
      win.webContents.send('menu:action', 'saveThenClose')
    }
  })
}
