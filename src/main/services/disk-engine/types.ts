import type { DiskFile, DiskFormat, System } from '../../../shared/types'

export interface DiskInfo {
  label: string
  id: string
  capacityBytes: number
  freeBytes: number
}

export interface SourceFile {
  name: string
  data: Buffer
}

export interface WriteTarget {
  name: string
  type: DiskFile['type']
}

export interface FormatOpts {
  label: string
  id?: string
}

/** Identifies one directory entry. Names alone are not unique (D64 allows duplicates, PETSCII names are lossy). */
export type FileRef = Pick<DiskFile, 'name' | 'path' | 'startTrack' | 'startSector'>

export interface DiskFormatPlugin {
  id: DiskFormat
  systems: System[]
  capabilities: { read: boolean; write: boolean; format: boolean }
  parse(buffer: Buffer): Promise<DiskInfo>
  listFiles(buffer: Buffer): Promise<DiskFile[]>
  readFile(buffer: Buffer, path: string): Promise<Buffer>
  writeFile(buffer: Buffer, file: SourceFile, target: WriteTarget): Promise<Buffer>
  deleteFile(buffer: Buffer, fileName: string): Promise<Buffer>
  format(opts: FormatOpts): Promise<Buffer>
  /** Reads exactly the entry `ref` points at. Falls back to readFile(path) when absent. */
  readEntry?(buffer: Buffer, ref: FileRef): Promise<Buffer>
  /** Replaces the contents of an entry in place, keeping its name and type. Throws and leaves `buffer` untouched on failure. */
  replaceFile?(buffer: Buffer, ref: FileRef, data: Buffer): Promise<Buffer>
}
