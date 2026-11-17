import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { registerFsHandlers } from './ipc/fs'
import { registerDiskHandlers } from './ipc/disk'
import { registerPrefsHandlers } from './ipc/prefs'
import { registerIsoHandlers } from './ipc/iso'
import { registerEmulatorHandlers } from './ipc/emulator'
import { registerAppHandlers } from './ipc/app'

// Lets automated tests run against a throw-away profile instead of the user's real one.
if (process.env['IMAGINE_USER_DATA']) app.setPath('userData', process.env['IMAGINE_USER_DATA'])

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#15141a',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  registerFsHandlers()
  registerDiskHandlers()
  registerPrefsHandlers()
  registerIsoHandlers()
  registerEmulatorHandlers()
  await registerAppHandlers()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
