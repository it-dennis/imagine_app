import { ipcMain } from 'electron'
import { writeFile } from 'fs/promises'
import { buildIso9660 } from '../services/disk-engine/iso-writer'

interface IsoCreateOptions {
  source: string
  label: string
  output: string
}

export function registerIsoHandlers(): void {
  ipcMain.handle('iso:create', async (_e, opts: IsoCreateOptions) => {
    const image = await buildIso9660(opts.source, opts.label || 'UNTITLED')
    await writeFile(opts.output, image)
    return { path: opts.output, sizeBytes: image.length }
  })
}
