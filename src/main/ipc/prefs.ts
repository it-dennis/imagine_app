import { ipcMain, app } from 'electron'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { join } from 'path'

const prefsPath = () => join(app.getPath('userData'), 'prefs.json')

export async function readPrefs(): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await readFile(prefsPath(), 'utf-8'))
  } catch {
    return {}
  }
}

export function registerPrefsHandlers(): void {
  ipcMain.handle('prefs:get', () => readPrefs())

  ipcMain.handle('prefs:set', async (_e, patch: Record<string, unknown>) => {
    const next = { ...(await readPrefs()), ...patch }
    await mkdir(app.getPath('userData'), { recursive: true })
    await writeFile(prefsPath(), JSON.stringify(next, null, 2), 'utf-8')
    return next
  })
}
