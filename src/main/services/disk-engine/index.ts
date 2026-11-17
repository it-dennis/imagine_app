import type { DiskFormat, System } from '../../../shared/types'
import type { DiskFormatPlugin } from './types'
import { d64Plugin } from './formats/d64'
import { stPlugin, imgPlugin } from './formats/fat12'
import { adfPlugin } from './formats/adf'
import { isoPlugin } from './formats/iso9660'
import { msaPlugin } from './formats/msa'

const registry = new Map<DiskFormat, DiskFormatPlugin>()
for (const plugin of [d64Plugin, stPlugin, imgPlugin, adfPlugin, isoPlugin, msaPlugin]) {
  registry.set(plugin.id, plugin)
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
