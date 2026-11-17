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
}
