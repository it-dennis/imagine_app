import type { VirtualDisk, System, DiskFormat, DiskFile } from '../shared/types'

export {}

interface NewDiskOptions {
  system: System
  format: DiskFormat
  label: string
  folder: string
}

interface WriteTarget {
  name: string
  type: DiskFile['type']
}

interface ImagineAPI {
  disk: {
    create: (opts: NewDiskOptions) => Promise<VirtualDisk>
    open: (path: string) => Promise<VirtualDisk>
    write: (diskId: string, sourcePath: string, target: WriteTarget) => Promise<VirtualDisk>
    readFile: (diskId: string, path: string) => Promise<string>
    format: (diskId: string) => Promise<VirtualDisk>
    delete: (diskId: string) => Promise<boolean>
    eject: (diskId: string) => Promise<boolean>
  }
  iso: {
    create: (opts: { source: string; label: string; output: string }) => Promise<{ path: string; sizeBytes: number }>
  }
  fs: {
    pickFile: (filter?: string[]) => Promise<string | null>
    pickFolder: () => Promise<string | null>
    readFile: (path: string) => Promise<string>
  }
  prefs: {
    get: () => Promise<Record<string, unknown>>
    set: (patch: Record<string, unknown>) => Promise<Record<string, unknown>>
  }
}

declare global {
  interface Window {
    imagineAPI: ImagineAPI
  }
}
