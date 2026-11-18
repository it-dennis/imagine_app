import type { DiskFile, DiskFormat, System } from '../../../shared/types'
import type { DiskFormatPlugin, FileRef } from './types'
import { d64Plugin } from './formats/d64'
import { d71Plugin } from './formats/d71'
import { d81Plugin } from './formats/d81'
import { stPlugin, imgPlugin } from './formats/fat12'
import { adfPlugin } from './formats/adf'
import { isoPlugin } from './formats/iso9660'
import { msaPlugin } from './formats/msa'

const registry = new Map<DiskFormat, DiskFormatPlugin>()
for (const plugin of [d64Plugin, d71Plugin, d81Plugin, stPlugin, imgPlugin, adfPlugin, isoPlugin, msaPlugin]) {
  registry.set(plugin.id, plugin)
}

/** Formats a new, blank disk can be created for (a plugin is registered and supports format()). */
export function creatableFormats(): DiskFormat[] {
  return [...registry.values()].filter((p) => p.capabilities.format && p.id !== 'iso').map((p) => p.id)
}

export function getPlugin(format: DiskFormat): DiskFormatPlugin {
  const plugin = registry.get(format)
  if (!plugin) throw new Error(`No disk format plugin registered for "${format}" yet.`)
  return plugin
}

export function formatFromPath(path: string): DiskFormat {
  const ext = path.split('.').pop()?.toLowerCase()
  if (!ext) throw new Error(`Cannot determine disk format from path: ${path}`)
  return ext as DiskFormat
}

export function defaultSystemForFormat(format: DiskFormat): System {
  switch (format) {
    case 'd64':
    case 'd71':
    case 'd81':
      return 'c64'
    case 'adf':
      return 'amiga'
    case 'st':
    case 'msa':
      return 'atariST'
    case 'img':
    case 'iso':
      return 'dos'
    case 'dsk':
      return 'msx'
  }
}

/** Reads the entry `ref` identifies, preferring the plugin's exact lookup over the (lossy) display name. */
export async function readFileEntry(plugin: DiskFormatPlugin, buffer: Buffer, ref: FileRef): Promise<Buffer> {
  return plugin.readEntry ? plugin.readEntry(buffer, ref) : plugin.readFile(buffer, ref.path ?? ref.name)
}

/**
 * Replaces a file's contents in place and returns the new image plus the entry's new reference
 * (its start sector can change). Plugins without their own implementation get delete + write by name,
 * which only works for root-level files because those formats write to the root directory.
 */
export async function replaceFileEntry(
  plugin: DiskFormatPlugin,
  buffer: Buffer,
  ref: FileRef,
  data: Buffer,
): Promise<{ buffer: Buffer; file: DiskFile }> {
  if (!plugin.capabilities.write) throw new Error('This disk format is read-only.')
  const before = await plugin.listFiles(buffer)
  const path = ref.path ?? ref.name
  const byLocation = ref.startTrack !== undefined && ref.startSector !== undefined
  const index = before.findIndex((f) =>
    byLocation ? f.startTrack === ref.startTrack && f.startSector === ref.startSector : (f.path ?? f.name) === path,
  )
  if (index < 0) throw new Error(`File "${path}" not found.`)
  const entry = before[index]

  let updated: Buffer
  if (plugin.replaceFile) {
    updated = await plugin.replaceFile(buffer, ref, data)
  } else {
    if ((entry.path ?? entry.name).includes('/')) throw new Error('Files inside folders cannot be saved yet.')
    const without = await plugin.deleteFile(buffer, entry.name)
    updated = await plugin.writeFile(without, { name: entry.name, data }, { name: entry.name, type: entry.type })
  }

  const after = await plugin.listFiles(updated)
  // In-place replacement keeps the directory order; the fallback may move the entry, so look it up by name.
  const file = plugin.replaceFile ? after[index] : after.find((f) => (f.path ?? f.name) === (entry.path ?? entry.name))
  if (!file) throw new Error('Saved file could not be found again after writing.')
  return { buffer: updated, file }
}
