import type { DiskFormat, System } from '../../shared/types'

interface OpenDisk {
  path: string
  format: DiskFormat
  system: System
}

const openDisks = new Map<string, OpenDisk>()

export function registerOpenDisk(id: string, info: OpenDisk): void {
  openDisks.set(id, info)
}

export function getOpenDisk(id: string): OpenDisk {
  const disk = openDisks.get(id)
  if (!disk) throw new Error(`Disk "${id}" is not open in this session.`)
  return disk
}

export function removeOpenDisk(id: string): void {
  openDisks.delete(id)
}
