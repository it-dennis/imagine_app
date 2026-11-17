import { ipcMain, dialog, BrowserWindow } from 'electron'
import { readFile } from 'fs/promises'

export function registerFsHandlers(): void {
  ipcMain.handle('fs:pickFile', async (event, filter?: string[]) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? undefined
    const result = await dialog.showOpenDialog(win as BrowserWindow, {
      properties: ['openFile'],
      filters:
        filter && filter.length
          ? [{ name: 'Disk images', extensions: filter.map((f) => f.replace(/^\./, '')) }]
          : undefined,
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('fs:pickFolder', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? undefined
    const result = await dialog.showOpenDialog(win as BrowserWindow, {
      properties: ['openDirectory', 'createDirectory'],
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('fs:readFile', async (_e, path: string) => {
    const data = await readFile(path)
    return data.toString('base64')
  })
}
