import type { DiskFile } from '../../../../shared/types'
import type { DiskFormatPlugin, DiskInfo, FormatOpts, SourceFile, WriteTarget } from '../types'
import { petsciiToText, textToPetscii } from '../petscii'

// Standard 35-track D64, no error-info bytes: 683 sectors * 256 bytes.
const TOTAL_BYTES = 174848
const BAM_TRACK = 18
const BAM_SECTOR = 0
const DIR_START_TRACK = 18
const DIR_START_SECTOR = 1
const TYPE_CODE: Record<string, number> = { DEL: 0, SEQ: 1, PRG: 2, USR: 3, REL: 4 }
const TYPE_NAME = ['DEL', 'SEQ', 'PRG', 'USR', 'REL']

function sectorsInTrack(track: number): number {
  if (track < 1 || track > 35) throw new Error(`Invalid D64 track ${track}`)
  if (track <= 17) return 21
  if (track <= 24) return 19
  if (track <= 30) return 18
  return 17
}

const TRACK_START = ((): number[] => {
  const start = new Array(36).fill(0)
  let cum = 0
  for (let t = 1; t <= 35; t++) {
    start[t] = cum
    cum += sectorsInTrack(t)
  }
  return start
})()

function offset(track: number, sector: number): number {
  return (TRACK_START[track] + sector) * 256
}

function bamEntryOffset(track: number): number {
  return offset(BAM_TRACK, BAM_SECTOR) + 4 + (track - 1) * 4
}

function isSectorFree(buf: Buffer, track: number, sector: number): boolean {
  const base = bamEntryOffset(track)
  const byteIndex = 1 + (sector >> 3)
  const bit = sector & 7
  return ((buf[base + byteIndex] >> bit) & 1) === 1
}

function setSectorUsed(buf: Buffer, track: number, sector: number, used: boolean): void {
  const base = bamEntryOffset(track)
  const byteIndex = 1 + (sector >> 3)
  const bit = sector & 7
  const mask = 1 << bit
  const wasFree = (buf[base + byteIndex] & mask) !== 0
  if (used && wasFree) {
    buf[base + byteIndex] &= ~mask
    buf[base] -= 1
  } else if (!used && !wasFree) {
    buf[base + byteIndex] |= mask
    buf[base] += 1
  }
}

function allocateSectors(
  buf: Buffer,
  count: number,
  opts: { onlyTrack?: number; excludeTrack?: number } = {},
): { track: number; sector: number }[] {
  const tracks = opts.onlyTrack
    ? [opts.onlyTrack]
    : Array.from({ length: 35 }, (_, i) => i + 1).filter((t) => t !== opts.excludeTrack)
  const result: { track: number; sector: number }[] = []
  for (const t of tracks) {
    for (let s = 0; s < sectorsInTrack(t) && result.length < count; s++) {
      if (isSectorFree(buf, t, s)) {
        setSectorUsed(buf, t, s, true)
        result.push({ track: t, sector: s })
      }
    }
    if (result.length >= count) break
  }
  if (result.length < count) throw new Error('Disk is full.')
  return result
}

function readBam(buf: Buffer): { freeSectors: number; label: string; id: string } {
  const base = offset(BAM_TRACK, BAM_SECTOR)
  let freeSectors = 0
  for (let t = 1; t <= 35; t++) freeSectors += buf[bamEntryOffset(t)]
  return {
    freeSectors,
    label: petsciiToText(buf.subarray(base + 0x90, base + 0xa0)),
    id: petsciiToText(buf.subarray(base + 0xa2, base + 0xa4)),
  }
}

function walkDirectoryChain(buf: Buffer, onSector: (base: number) => 'continue' | 'stop'): void {
  let track = DIR_START_TRACK
  let sector = DIR_START_SECTOR
  const visited = new Set<string>()
  while (track !== 0) {
    const key = `${track}:${sector}`
    if (visited.has(key)) return
    visited.add(key)
    const base = offset(track, sector)
    if (onSector(base) === 'stop') return
    const nextTrack = buf[base]
    const nextSector = buf[base + 1]
    track = nextTrack
    sector = nextSector
  }
}

interface DirEntry {
  offset: number
  type: number
  track: number
  sector: number
  name: string
  blocks: number
}

function readDirectoryEntries(buf: Buffer): DirEntry[] {
  const entries: DirEntry[] = []
  walkDirectoryChain(buf, (base) => {
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

function findFreeDirectorySlot(buf: Buffer): { sectorOffset: number; entryIndex: number } {
  let found: { sectorOffset: number; entryIndex: number } | null = null
  let lastBase = -1
  walkDirectoryChain(buf, (base) => {
    lastBase = base
    for (let i = 0; i < 8; i++) {
      const eOff = base + i * 32
      if ((buf[eOff + 2] & 0x0f) === 0) {
        found = { sectorOffset: base, entryIndex: i }
        return 'stop'
      }
    }
    return 'continue'
  })
  if (found) return found

  const [newSector] = allocateSectors(buf, 1, { onlyTrack: DIR_START_TRACK })
  const newBase = offset(newSector.track, newSector.sector)
  buf.fill(0, newBase, newBase + 256)
  buf[newBase] = 0
  buf[newBase + 1] = 0xff
  buf[lastBase] = newSector.track
  buf[lastBase + 1] = newSector.sector
  return { sectorOffset: newBase, entryIndex: 0 }
}

function readChain(buf: Buffer, startTrack: number, startSector: number): Buffer {
  const chunks: Buffer[] = []
  let track = startTrack
  let sector = startSector
  const visited = new Set<string>()
  while (track !== 0) {
    const key = `${track}:${sector}`
    if (visited.has(key)) break
    visited.add(key)
    const base = offset(track, sector)
    const nextTrack = buf[base]
    const nextSector = buf[base + 1]
    if (nextTrack === 0) {
      const used = Math.max(0, nextSector - 1)
      chunks.push(buf.subarray(base + 2, base + 2 + used))
      break
    }
    chunks.push(buf.subarray(base + 2, base + 256))
    track = nextTrack
    sector = nextSector
  }
  return Buffer.concat(chunks)
}

function freeChain(buf: Buffer, startTrack: number, startSector: number): void {
  let track = startTrack
  let sector = startSector
  const visited = new Set<string>()
  while (track !== 0) {
    const key = `${track}:${sector}`
    if (visited.has(key)) break
    visited.add(key)
    const base = offset(track, sector)
    const nextTrack = buf[base]
    const nextSector = buf[base + 1]
    setSectorUsed(buf, track, sector, false)
    track = nextTrack
    sector = nextSector
  }
}

function randomDiskId(): string {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  return Array.from({ length: 2 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

async function parse(buffer: Buffer): Promise<DiskInfo> {
  const { freeSectors, label, id } = readBam(buffer)
  return { label, id, capacityBytes: TOTAL_BYTES, freeBytes: freeSectors * 256 }
}

async function listFiles(buffer: Buffer): Promise<DiskFile[]> {
  return readDirectoryEntries(buffer).map((e) => ({
    name: e.name,
    type: TYPE_NAME[e.type] as DiskFile['type'],
    sizeBytes: readChain(buffer, e.track, e.sector).length,
    blocks: e.blocks,
    startTrack: e.track,
    startSector: e.sector,
  }))
}

async function readFile(buffer: Buffer, path: string): Promise<Buffer> {
  const target = path.trim().toUpperCase()
  const entry = readDirectoryEntries(buffer).find((e) => e.name === target)
  if (!entry) throw new Error(`File "${path}" not found.`)
  return readChain(buffer, entry.track, entry.sector)
}

async function writeFile(buffer: Buffer, file: SourceFile, target: WriteTarget): Promise<Buffer> {
  const buf = Buffer.from(buffer)
  const code = TYPE_CODE[target.type]
  if (!code) throw new Error(`Unsupported D64 file type "${target.type}".`)

  const payload = file.data
  const sectorCount = Math.max(1, Math.ceil(payload.length / 254))
  const sectors = allocateSectors(buf, sectorCount, { excludeTrack: BAM_TRACK })

  sectors.forEach(({ track, sector }, i) => {
    const base = offset(track, sector)
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

  const { sectorOffset, entryIndex } = findFreeDirectorySlot(buf)
  const eOff = sectorOffset + entryIndex * 32
  buf[eOff + 2] = 0x80 | code
  buf[eOff + 3] = sectors[0].track
  buf[eOff + 4] = sectors[0].sector
  textToPetscii(target.name, 16).copy(buf, eOff + 5)
  buf.writeUInt16LE(sectorCount, eOff + 30)

  return buf
}

async function deleteFile(buffer: Buffer, fileName: string): Promise<Buffer> {
  const buf = Buffer.from(buffer)
  const target = fileName.trim().toUpperCase()
  let deleted = false

  walkDirectoryChain(buf, (base) => {
    for (let i = 0; i < 8; i++) {
      const eOff = base + i * 32
      if ((buf[eOff + 2] & 0x0f) === 0) continue
      if (petsciiToText(buf.subarray(eOff + 5, eOff + 21)) === target) {
        freeChain(buf, buf[eOff + 3], buf[eOff + 4])
        buf[eOff + 2] = 0
        deleted = true
        return 'stop'
      }
    }
    return 'continue'
  })

  if (!deleted) throw new Error(`File "${fileName}" not found.`)
  return buf
}

async function format(opts: FormatOpts): Promise<Buffer> {
  const buf = Buffer.alloc(TOTAL_BYTES, 0x00)
  const base = offset(BAM_TRACK, BAM_SECTOR)

  buf[base] = DIR_START_TRACK
  buf[base + 1] = DIR_START_SECTOR
  buf[base + 2] = 0x41

  for (let t = 1; t <= 35; t++) {
    const count = sectorsInTrack(t)
    const entryOff = bamEntryOffset(t)
    const bits = (1 << count) - 1
    buf[entryOff] = count
    buf[entryOff + 1] = bits & 0xff
    buf[entryOff + 2] = (bits >> 8) & 0xff
    buf[entryOff + 3] = (bits >> 16) & 0xff
  }

  textToPetscii(opts.label || 'UNTITLED', 16).copy(buf, base + 0x90)
  buf[base + 0xa0] = 0xa0
  buf[base + 0xa1] = 0xa0
  textToPetscii(opts.id ?? randomDiskId(), 2).copy(buf, base + 0xa2)
  buf[base + 0xa4] = 0xa0
  textToPetscii('2A', 2).copy(buf, base + 0xa5)
  for (let i = 0xa7; i <= 0xaa; i++) buf[base + i] = 0xa0

  const dirBase = offset(DIR_START_TRACK, DIR_START_SECTOR)
  buf[dirBase] = 0x00
  buf[dirBase + 1] = 0xff

  setSectorUsed(buf, BAM_TRACK, BAM_SECTOR, true)
  setSectorUsed(buf, DIR_START_TRACK, DIR_START_SECTOR, true)

  return buf
}

export const d64Plugin: DiskFormatPlugin = {
  id: 'd64',
  systems: ['c64', 'vic20', 'plus4'],
  capabilities: { read: true, write: true, format: true },
  parse,
  listFiles,
  readFile,
  writeFile,
  deleteFile,
  format,
}
