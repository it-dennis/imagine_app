import { ipcMain } from 'electron'
import { basename, dirname, extname } from 'path'
import { writeNewFile } from '../services/disk-files'
import { buildIso9660 } from '../services/disk-engine/iso-writer'

interface IsoCreateOptions {
  source: string
  label: string
  output: string
}

export function registerIsoHandlers(): void {
  ipcMain.handle('iso:create', async (_e, opts: IsoCreateOptions) => {
    const image = await buildIso9660(opts.source, opts.label || 'UNTITLED')
    const wanted = opts.output
    const path = await writeNewFile(dirname(wanted), basename(wanted, extname(wanted)), extname(wanted).slice(1) || 'iso', image)
    return { path, sizeBytes: image.length }
  })
}
