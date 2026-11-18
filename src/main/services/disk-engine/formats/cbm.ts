import type { DiskFile, DiskFormat, System } from '../../../../shared/types'
import type { DiskFormatPlugin, DiskInfo, FileRef, FormatOpts, SourceFile, WriteTarget } from '../types'
import { petsciiToText, textToPetscii } from '../petscii'

// Shared engine for the Commodore DOS disk images (D64, D71, D81). The three formats differ only in their
// geometry (tracks and sectors), where the BAM (block availability map) lives and how the header looks;
// directory entries, file chains and the allocation rules are the same. Each format supplies a CbmGeometry.

export const TYPE_CODE: Record<string, number> = { DEL: 0, SEQ: 1, PRG: 2, USR: 3, REL: 4 }
export const TYPE_NAME = ['DEL', 'SEQ', 'PRG', 'USR', 'REL']

export interface CbmGeometry {
  id: DiskFormat
  systems: System[]
  totalBytes: number
  tracks: number
  sectorsInTrack(track: number): number
  /** Byte offset of a sector in the image. */
  offset(track: number, sector: number): number
  /** Track and sector of the header (disk name, id) and the first directory sector. */
  header: { track: number; sector: number }
  dir: { track: number; sector: number }
  /** Tracks that hold the directory and BAM; file data is not placed there and their free sectors are not counted. */
  reservedTracks: number[]
  /** Absolute byte offsets of a track's free-sector counter and the first byte of its bitmap. */
  bam(track: number): { count: number; bits: number }
  /** Offsets of the disk name and id relative to the start of the header sector. */
  nameOffset: number
  idOffset: number
  /** Builds a blank formatted image. */
  format(opts: { label: string; id: string }): Buffer
}

export interface DirEntry {
  offset: number
  type: number
  track: number
  sector: number
  name: string
  blocks: number
}

// --- BAM ------------------------------------------------------------------------------------------------

export function isSectorFree(g: CbmGeometry, buf: Buffer, track: number, sector: number): boolean {
  return ((buf[g.bam(track).bits + (sector >> 3)] >> (sector & 7)) & 1) === 1
}

export function setSectorUsed(g: CbmGeometry, buf: Buffer, track: number, sector: number, used: boolean): void {
  const { count, bits } = g.bam(track)
  const at = bits + (sector >> 3)
  const mask = 1 << (sector & 7)
  const wasFree = (buf[at] & mask) !== 0
  if (used && wasFree) {
    buf[at] &= ~mask
    buf[count] -= 1
  } else if (!used && !wasFree) {
    buf[at] |= mask
    buf[count] += 1
  }
}

function allocateSectors(
  g: CbmGeometry,
  buf: Buffer,
  count: number,
  opts: { onlyTrack?: number; excludeReserved?: boolean } = {},
): { track: number; sector: number }[] {
  const tracks = opts.onlyTrack
    ? [opts.onlyTrack]
    : Array.from({ length: g.tracks }, (_, i) => i + 1).filter((t) => !(opts.excludeReserved && g.reservedTracks.includes(t)))
  const result: { track: number; sector: number }[] = []
  for (const t of tracks) {
    for (let s = 0; s < g.sectorsInTrack(t) && result.length < count; s++) {
      if (isSectorFree(g, buf, t, s)) {
        setSectorUsed(g, buf, t, s, true)
        result.push({ track: t, sector: s })
      }
    }
    if (result.length >= count) break
  }
  if (result.length < count) throw new Error('Disk is full.')
  return result
}

/** Free sectors as DOS reports them: the directory/BAM tracks are not counted. */
function freeSectors(g: CbmGeometry, buf: Buffer): number {
  let free = 0
  for (let t = 1; t <= g.tracks; t++) if (!g.reservedTracks.includes(t)) free += buf[g.bam(t).count]
  return free
}

/** Marks every sector of a track as used (used for the reserved tracks of a freshly formatted image). */
export function reserveTrack(g: CbmGeometry, buf: Buffer, track: number): void {
  for (let s = 0; s < g.sectorsInTrack(track); s++) setSectorUsed(g, buf, track, s, true)
}

/** A BAM with every sector free. */
export function initBam(g: CbmGeometry, buf: Buffer): void {
  for (let t = 1; t <= g.tracks; t++) {
    const { count, bits } = g.bam(t)
    const spt = g.sectorsInTrack(t)
    buf[count] = spt
    for (let s = 0; s < spt; s++) buf[bits + (s >> 3)] |= 1 << (s & 7)
  }
}

// --- directory ------------------------------------------------------------------------------------------

function walkDirectoryChain(g: CbmGeometry, buf: Buffer, onSector: (base: number) => 'continue' | 'stop'): void {
  let track = g.dir.track
  let sector = g.dir.sector
  const visited = new Set<string>()
  while (track !== 0) {
    const key = `${track}:${sector}`
    if (visited.has(key) || track > g.tracks || sector >= g.sectorsInTrack(track)) return
    visited.add(key)
    const base = g.offset(track, sector)
    if (onSector(base) === 'stop') return
    track = buf[base]
    sector = buf[base + 1]
  }
}

function readDirectoryEntries(g: CbmGeometry, buf: Buffer): DirEntry[] {
  const entries: DirEntry[] = []
  walkDirectoryChain(g, buf, (base) => {
    for (let i = 0; i < 8; i++) {
      const eOff = base + i * 32
      const typeByte = buf[eOff + 2]
      if ((typeByte & 0x0f) === 0) continue
      entries.push({
        offset: eOff,
        type: typeByte & 0x0f,
        track: buf[eOff + 3],
        sector: buf[eOff + 4],
        name: petsciiToText(buf.subarray(eOff + 5, eOff + 21)),
        blocks: buf.readUInt16LE(eOff + 30),
      })
    }
    return 'continue'
  })
  return entries
}

function findFreeDirectorySlot(g: CbmGeometry, buf: Buffer): { sectorOffset: number; entryIndex: number } {
  let found: { sectorOffset: number; entryIndex: number } | null = null
  let lastBase = -1
  walkDirectoryChain(g, buf, (base) => {
    lastBase = base
    for (let i = 0; i < 8; i++) {
      if ((buf[base + i * 32 + 2] & 0x0f) === 0) {
        found = { sectorOffset: base, entryIndex: i }
        return 'stop'
      }
    }
    return 'continue'
  })
  if (found) return found

  const [next] = allocateSectors(g, buf, 1, { onlyTrack: g.dir.track })
  const nextBase = g.offset(next.track, next.sector)
  buf.fill(0, nextBase, nextBase + 256)
  buf[nextBase] = 0
  buf[nextBase + 1] = 0xff
  buf[lastBase] = next.track
  buf[lastBase + 1] = next.sector
  return { sectorOffset: nextBase, entryIndex: 0 }
}

// --- file chains ----------------------------------------------------------------------------------------

function readChain(g: CbmGeometry, buf: Buffer, startTrack: number, startSector: number): Buffer {
  const chunks: Buffer[] = []
  let track = startTrack
  let sector = startSector
  const visited = new Set<string>()
  while (track !== 0) {
    const key = `${track}:${sector}`
    if (visited.has(key) || track > g.tracks || sector >= g.sectorsInTrack(track)) break
    visited.add(key)
    const base = g.offset(track, sector)
    if (buf[base] === 0) {
      chunks.push(buf.subarray(base + 2, base + 2 + Math.max(0, buf[base + 1] - 1)))
      break
    }
    chunks.push(buf.subarray(base + 2, base + 256))
    track = buf[base]
    sector = buf[base + 1]
  }
  return Buffer.concat(chunks)
}

function freeChain(g: CbmGeometry, buf: Buffer, startTrack: number, startSector: number): void {
  let track = startTrack
  let sector = startSector
  const visited = new Set<string>()
  while (track !== 0) {
    const key = `${track}:${sector}`
    if (visited.has(key) || track > g.tracks || sector >= g.sectorsInTrack(track)) break
    visited.add(key)
    const base = g.offset(track, sector)
    const nextTrack = buf[base]
    const nextSector = buf[base + 1]
    setSectorUsed(g, buf, track, sector, false)
    track = nextTrack
    sector = nextSector
  }
}

function writeChain(g: CbmGeometry, buf: Buffer, sectors: { track: number; sector: number }[], payload: Buffer): void {
  sectors.forEach(({ track, sector }, i) => {
    const base = g.offset(track, sector)
    const chunk = payload.subarray(i * 254, i * 254 + 254)
    if (i === sectors.length - 1) {
      buf[base] = 0
      buf[base + 1] = chunk.length + 1
    } else {
      buf[base] = sectors[i + 1].track
      buf[base + 1] = sectors[i + 1].sector
    }
    chunk.copy(buf, base + 2)
  })
}

export function randomDiskId(): string {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  return Array.from({ length: 2 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

// --- the plugin -----------------------------------------------------------------------------------------

export function createCbmPlugin(g: CbmGeometry): DiskFormatPlugin {
  const headerBase = () => g.offset(g.header.track, g.header.sector)

  function findEntry(buf: Buffer, ref: FileRef): DirEntry {
    const entries = readDirectoryEntries(g, buf)
    const byLocation = ref.startTrack !== undefined && ref.startSector !== undefined
    const entry = byLocation
      ? entries.find((e) => e.track === ref.startTrack && e.sector === ref.startSector)
      : entries.find((e) => e.name === (ref.path ?? ref.name).trim().toUpperCase())
    if (!entry) throw new Error(`File "${ref.path ?? ref.name}" not found.`)
    return entry
  }

  return {
    id: g.id,
    systems: g.systems,
    capabilities: { read: true, write: true, format: true },

    async parse(buffer: Buffer): Promise<DiskInfo> {
      const base = headerBase()
      return {
        label: petsciiToText(buffer.subarray(base + g.nameOffset, base + g.nameOffset + 16)),
        id: petsciiToText(buffer.subarray(base + g.idOffset, base + g.idOffset + 2)),
        capacityBytes: g.totalBytes,
        freeBytes: freeSectors(g, buffer) * 256,
      }
    },

    async listFiles(buffer: Buffer): Promise<DiskFile[]> {
      return readDirectoryEntries(g, buffer).map((e) => ({
        name: e.name,
        type: TYPE_NAME[e.type] as DiskFile['type'],
        sizeBytes: readChain(g, buffer, e.track, e.sector).length,
        blocks: e.blocks,
        startTrack: e.track,
        startSector: e.sector,
      }))
    },

    async readFile(buffer: Buffer, path: string): Promise<Buffer> {
      const target = path.trim().toUpperCase()
      const entry = readDirectoryEntries(g, buffer).find((e) => e.name === target)
      if (!entry) throw new Error(`File "${path}" not found.`)
      return readChain(g, buffer, entry.track, entry.sector)
    },

    async readEntry(buffer: Buffer, ref: FileRef): Promise<Buffer> {
      const entry = findEntry(buffer, ref)
      return readChain(g, buffer, entry.track, entry.sector)
    },

    async writeFile(buffer: Buffer, file: SourceFile, target: WriteTarget): Promise<Buffer> {
      const buf = Buffer.from(buffer)
      const code = TYPE_CODE[target.type]
      if (!code) throw new Error(`Unsupported file type "${target.type}" on ${g.id.toUpperCase()} disks.`)
      const payload = file.data
      const sectorCount = Math.max(1, Math.ceil(payload.length / 254))
      const sectors = allocateSectors(g, buf, sectorCount, { excludeReserved: true })
      writeChain(g, buf, sectors, payload)

      const { sectorOffset, entryIndex } = findFreeDirectorySlot(g, buf)
      const eOff = sectorOffset + entryIndex * 32
      buf[eOff + 2] = 0x80 | code
      buf[eOff + 3] = sectors[0].track
      buf[eOff + 4] = sectors[0].sector
      textToPetscii(target.name, 16).copy(buf, eOff + 5)
      buf.writeUInt16LE(sectorCount, eOff + 30)
      return buf
    },

    /** Rewrites a file's sector chain and patches only the start sector and block count of its directory entry. */
    async replaceFile(buffer: Buffer, ref: FileRef, data: Buffer): Promise<Buffer> {
      const buf = Buffer.from(buffer)
      const entry = findEntry(buf, ref)
      if (entry.type !== TYPE_CODE.PRG && entry.type !== TYPE_CODE.SEQ && entry.type !== TYPE_CODE.USR) {
        throw new Error(`Files of type ${TYPE_NAME[entry.type]} cannot be replaced.`)
      }
      freeChain(g, buf, entry.track, entry.sector)
      const sectorCount = Math.max(1, Math.ceil(data.length / 254))
      const sectors = allocateSectors(g, buf, sectorCount, { excludeReserved: true }) // throws before anything is returned
      writeChain(g, buf, sectors, data)
      buf[entry.offset + 3] = sectors[0].track
      buf[entry.offset + 4] = sectors[0].sector
      buf.writeUInt16LE(sectorCount, entry.offset + 30)
      return buf
    },

    async deleteFile(buffer: Buffer, fileName: string): Promise<Buffer> {
      const buf = Buffer.from(buffer)
      const target = fileName.trim().toUpperCase()
      let deleted = false
      walkDirectoryChain(g, buf, (base) => {
        for (let i = 0; i < 8; i++) {
          const eOff = base + i * 32
          if ((buf[eOff + 2] & 0x0f) === 0) continue
          if (petsciiToText(buf.subarray(eOff + 5, eOff + 21)) === target) {
            freeChain(g, buf, buf[eOff + 3], buf[eOff + 4])
            buf[eOff + 2] = 0
            deleted = true
            return 'stop'
          }
        }
        return 'continue'
      })
      if (!deleted) throw new Error(`File "${fileName}" not found.`)
      return buf
    },

    async format(opts: FormatOpts): Promise<Buffer> {
      return g.format({ label: opts.label || 'UNTITLED', id: opts.id ?? randomDiskId() })
    },
  }
}
