import { ipcMain } from 'electron'
import { randomUUID } from 'crypto'
import { readFile, writeFile as writeFileFs, stat } from 'fs/promises'
import { getPlugin, formatFromPath, defaultSystemForFormat } from '../services/disk-engine'
import { registerOpenDisk, getOpenDisk, removeOpenDisk } from '../services/disk-registry'
import type { DiskFile, DiskFormat, System, VirtualDisk } from '../../shared/types'

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

export function registerDiskHandlers(): void {
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
      const fileName = `${opts.label.trim().toLowerCase() || 'untitled'}.${opts.format}`
      const path = `${opts.folder.replace(/[\\/]+$/, '')}/${fileName}`
      await writeFileFs(path, buffer)
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

  ipcMain.handle('disk:delete', async (_e, diskId: string) => {
    removeOpenDisk(diskId)
    return true
  })

  ipcMain.handle('disk:eject', async (_e, diskId: string) => {
    removeOpenDisk(diskId)
    return true
  })
}
