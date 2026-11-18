import { ipcMain } from 'electron'
import { randomUUID } from 'crypto'
import { app } from 'electron'
import { createHash } from 'crypto'
import { readFile, writeFile as writeFileFs, stat } from 'fs/promises'
import { getPlugin, formatFromPath, defaultSystemForFormat, creatableFormats, readFileEntry, replaceFileEntry } from '../services/disk-engine'
import { defaultFolder, resolveFolder, sanitizeFileName, writeNewFile, writeFileAtomic } from '../services/disk-files'
import { registerOpenDisk, getOpenDisk, removeOpenDisk } from '../services/disk-registry'
import type { DiskFile, DiskFormat, System, VirtualDisk } from '../../shared/types'

const sha256 = (data: Buffer): string => createHash('sha256').update(data).digest('hex')

type FileRef = Pick<DiskFile, 'name' | 'path' | 'startTrack' | 'startSector'>

async function buildVirtualDisk(
  id: string,
  path: string,
  format: DiskFormat,
  system: System,
): Promise<VirtualDisk> {
  const buffer = await readFile(path)
  const plugin = getPlugin(format)
  const [info, files, stats] = await Promise.all([
    plugin.parse(buffer),
    plugin.listFiles(buffer),
    stat(path),
  ])
  return {
    id,
    name: info.label || path.split(/[\\/]/).pop()!.replace(/\.[^.]+$/, ''),
    system,
    format,
    path,
    capacityBytes: info.capacityBytes,
    freeBytes: info.freeBytes,
    files,
    writeProtected: false,
    modified: false,
    createdAt: stats.birthtime.toISOString().slice(0, 10),
  }
}

/** IMAGINE_DOCUMENTS_DIR lets tests keep new images out of the real Documents folder. */
export const documentsDir = (): string => process.env['IMAGINE_DOCUMENTS_DIR'] ?? app.getPath('documents')

export function registerDiskHandlers(): void {
  ipcMain.handle('disk:formats', () => creatableFormats())
  ipcMain.handle('fs:defaultFolder', () => defaultFolder(documentsDir()))

  ipcMain.handle('disk:open', async (_e, path: string) => {
    const format = formatFromPath(path)
    const system = defaultSystemForFormat(format)
    const id = randomUUID()
    registerOpenDisk(id, { path, format, system })
    return buildVirtualDisk(id, path, format, system)
  })

  ipcMain.handle(
    'disk:create',
    async (_e, opts: { system: System; format: DiskFormat; label: string; folder: string }) => {
      const plugin = getPlugin(opts.format)
      if (!plugin.capabilities.format) {
        throw new Error(`Format "${opts.format}" does not support creating new disks yet.`)
      }
      const buffer = await plugin.format({ label: opts.label })
      const baseName = sanitizeFileName(opts.label.trim().toLowerCase())
      const path = await writeNewFile(resolveFolder(opts.folder, documentsDir()), baseName, opts.format, buffer)
      const id = randomUUID()
      registerOpenDisk(id, { path, format: opts.format, system: opts.system })
      return buildVirtualDisk(id, path, opts.format, opts.system)
    },
  )

  ipcMain.handle(
    'disk:write',
    async (_e, diskId: string, sourcePath: string, target: { name: string; type: DiskFile['type'] }) => {
      const { path, format, system } = getOpenDisk(diskId)
      const plugin = getPlugin(format)
      if (!plugin.capabilities.write) throw new Error(`Format "${format}" is read-only.`)
      const [buffer, sourceData] = await Promise.all([readFile(path), readFile(sourcePath)])
      const updated = await plugin.writeFile(buffer, { name: target.name, data: sourceData }, target)
      await writeFileFs(path, updated)
      return buildVirtualDisk(diskId, path, format, system)
    },
  )

  ipcMain.handle('disk:readFile', async (_e, diskId: string, path: string) => {
    const { path: diskPath, format } = getOpenDisk(diskId)
    const plugin = getPlugin(format)
    const buffer = await readFile(diskPath)
    const content = await plugin.readFile(buffer, path)
    return content.toString('base64')
  })

  ipcMain.handle('disk:format', async (_e, diskId: string) => {
    const { path, format, system } = getOpenDisk(diskId)
    const plugin = getPlugin(format)
    if (!plugin.capabilities.format) throw new Error(`Format "${format}" cannot be formatted.`)
    const current = await readFile(path)
    const info = await plugin.parse(current)
    const updated = await plugin.format({ label: info.label })
    await writeFileFs(path, updated)
    return buildVirtualDisk(diskId, path, format, system)
  })

  /** Reads one entry (identified by its directory entry, not just its name) together with a content hash. */
  ipcMain.handle('disk:openFile', async (_e, diskId: string, ref: FileRef) => {
    const { path, format } = getOpenDisk(diskId)
    const data = await readFileEntry(getPlugin(format), await readFile(path), ref)
    return { data: data.toString('base64'), sha256: sha256(data) }
  })

  /**
   * Saves edited contents back into the image. `expectedSha256` is the hash of what the editor loaded;
   * if the file changed meanwhile (e.g. an emulator wrote to the image) the save is refused instead of
   * silently overwriting that work.
   */
  ipcMain.handle(
    'disk:saveFile',
    async (_e, diskId: string, ref: FileRef, dataBase64: string, expectedSha256: string) => {
      const { path, format, system } = getOpenDisk(diskId)
      const plugin = getPlugin(format)
      const image = await readFile(path)
      const current = await readFileEntry(plugin, image, ref)
      if (sha256(current) !== expectedSha256) {
        throw new Error('The file on the disk changed since you opened it (for example by an emulator). Reload it before saving.')
      }
      const { buffer, file } = await replaceFileEntry(plugin, image, ref, Buffer.from(dataBase64, 'base64'))
      await writeFileAtomic(path, buffer)
      return { disk: await buildVirtualDisk(diskId, path, format, system), file }
    },
  )

  /** Creates a new file from editor contents. Refuses a name that already exists on the disk. */
  ipcMain.handle(
    'disk:createFile',
    async (_e, diskId: string, target: { name: string; type: DiskFile['type'] }, dataBase64: string) => {
      const { path, format, system } = getOpenDisk(diskId)
      const plugin = getPlugin(format)
      const image = await readFile(path)
      const clash = (await plugin.listFiles(image)).some((f) => (f.path ?? f.name).toUpperCase() === target.name.toUpperCase())
      if (clash) throw new Error(`A file named "${target.name}" already exists on this disk.`)
      const buffer = await plugin.writeFile(image, { name: target.name, data: Buffer.from(dataBase64, 'base64') }, target)
      await writeFileAtomic(path, buffer)
      const disk = await buildVirtualDisk(diskId, path, format, system)
      const file = disk.files.find((f) => (f.path ?? f.name).toUpperCase() === target.name.toUpperCase())!
      return { disk, file }
    },
  )

  ipcMain.handle('disk:refresh', async (_e, diskId: string) => {
    const { path, format, system } = getOpenDisk(diskId)
    return buildVirtualDisk(diskId, path, format, system)
  })

  ipcMain.handle('disk:delete', async (_e, diskId: string) => {
    removeOpenDisk(diskId)
    return true
  })

  ipcMain.handle('disk:eject', async (_e, diskId: string) => {
    removeOpenDisk(diskId)
    return true
  })
}
