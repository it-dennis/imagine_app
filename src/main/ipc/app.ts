import { app, BrowserWindow, ipcMain, Menu, shell } from 'electron'
import { buildMenuTemplate, translator, type MenuLanguage } from '../menu'
import { readPrefs } from './prefs'

let state = { hasDisk: false, language: 'de' as MenuLanguage }

function rebuildMenu(): void {
  const menu = Menu.buildFromTemplate(
    buildMenuTemplate({
      t: translator(state.language),
      hasDisk: state.hasDisk,
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
  ipcMain.handle('app:setState', (_e, next: { hasDisk: boolean; language: MenuLanguage }) => {
    const changed = next.hasDisk !== state.hasDisk || next.language !== state.language
    state = { hasDisk: next.hasDisk, language: next.language === 'en' ? 'en' : 'de' }
    if (changed) rebuildMenu()
  })
  ipcMain.handle('app:info', () => ({ version: app.getVersion() }))
}
