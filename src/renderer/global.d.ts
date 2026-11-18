import type { VirtualDisk, System, DiskFormat, DiskFile, Language, MenuAction } from '../shared/types'

export {}

interface NewDiskOptions {
  system: System
  format: DiskFormat
  label: string
  folder: string
}

type FileRef = Pick<DiskFile, 'name' | 'path' | 'startTrack' | 'startSector'>

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
    refresh: (diskId: string) => Promise<VirtualDisk>
    formats: () => Promise<DiskFormat[]>
    openFile: (diskId: string, ref: FileRef) => Promise<{ data: string; sha256: string }>
    saveFile: (diskId: string, ref: FileRef, data: string, expectedSha256: string) => Promise<{ disk: VirtualDisk; file: DiskFile }>
    createFile: (diskId: string, target: WriteTarget, data: string) => Promise<{ disk: VirtualDisk; file: DiskFile }>
  }
  iso: {
    create: (opts: { source: string; label: string; output: string }) => Promise<{ path: string; sizeBytes: number }>
  }
  fs: {
    pickFile: (filter?: string[]) => Promise<string | null>
    pickFolder: () => Promise<string | null>
    readFile: (path: string) => Promise<string>
    defaultFolder: () => Promise<string>
  }
  app: {
    setState: (state: { hasDisk: boolean; language: Language; dirty: boolean; canRun: boolean; canAssemble: boolean }) => Promise<void>
    confirmUnsaved: (name: string) => Promise<'save' | 'discard' | 'cancel'>
    closeNow: () => Promise<void>
    info: () => Promise<{ version: string }>
    onMenuAction: (cb: (action: MenuAction) => void) => () => void
  }
  emulator: {
    launch: (opts: { diskId?: string; system?: System; hasFiles?: boolean; program?: string }) => Promise<{ kind: 'vice' | 'hatari' }>
    detect: () => Promise<{ vicePath?: string; hatariPath?: string }>
    onDiskChanged: (cb: (diskId: string) => void) => () => void
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
