export type System = 'c64' | 'vic20' | 'plus4' | 'amiga' | 'atariST' | 'dos' | 'msx' | 'cpc'
export type DiskFormat = 'd64' | 'd71' | 'd81' | 'adf' | 'st' | 'msa' | 'img' | 'dsk' | 'iso'
export type Theme = 'dark' | 'light' | 'system'
export type Accent = 'phosphor' | 'amber' | 'c64' | 'amiga' | 'neutral'
export type Font = 'modern' | 'mono' | 'pixel'
export type Language = 'de' | 'en'
export type ActiveTab = 'files' | 'basic' | 'asm' | 'hex'
export type DialogId =
  | 'newDisk'
  | 'fileBrowser'
  | 'writeFile'
  | 'format'
  | 'delete'
  | 'iso'
  | 'settings'
  | 'about'

export interface DiskFile {
  name: string
  type: 'PRG' | 'SEQ' | 'USR' | 'REL' | 'DEL' | 'DIR' | 'FILE'
  sizeBytes: number
  blocks: number
  startTrack?: number
  startSector?: number
  /** Full path including subfolders (e.g. "DOCS/README.TXT"). Equals `name` for root-level entries. */
  path?: string
}

export interface VirtualDisk {
  id: string
  name: string
  system: System
  format: DiskFormat
  path: string
  capacityBytes: number
  freeBytes: number
  files: DiskFile[]
  writeProtected: boolean
  modified: boolean
  createdAt: string
}

export interface Prefs {
  theme: Theme
  accent: Accent
  font: Font
  language: Language
  vicePath: string
}

export interface Toast {
  id: string
  intent: 'success' | 'info' | 'warning' | 'danger'
  title: string
  description?: string
  progress?: number
  duration?: number
}
