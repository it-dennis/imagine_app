import type { DiskFile, DiskFormat, System } from '../../../../shared/types'
import type { DiskFormatPlugin, DiskInfo, FormatOpts, SourceFile, WriteTarget } from '../types'

export interface Fat12Geometry {
  bytesPerSector: number
  sectorsPerCluster: number
  reservedSectors: number
  fatCount: number
  rootEntries: number
  totalSectors: number
  mediaDescriptor: number
  sectorsPerFat: number
  sectorsPerTrack: number
  heads: number
}

interface Layout extends Fat12Geometry {
  rootDirOffset: number
  rootDirBytes: number
  dataOffset: number
  clusterBytes: number
  totalClusters: number
}

const FREE = 0x000
const EOF_MIN = 0xff8
const BAD = 0xff7
const ATTR_DIR = 0x10
const ATTR_VOLUME = 0x08

function isEndOfChain(v: number): boolean {
  return v >= EOF_MIN
}

function layoutFromGeometry(geo: Fat12Geometry): Layout {
  const rootDirBytes = geo.rootEntries * 32
  const rootDirOffset = (geo.reservedSectors + geo.fatCount * geo.sectorsPerFat) * geo.bytesPerSector
  const dataOffset = rootDirOffset + rootDirBytes
  const clusterBytes = geo.sectorsPerCluster * geo.bytesPerSector
  const dataSectors =
    geo.totalSectors - geo.reservedSectors - geo.fatCount * geo.sectorsPerFat - Math.ceil(rootDirBytes / geo.bytesPerSector)
  const totalClusters = Math.floor(dataSectors / geo.sectorsPerCluster)
  return { ...geo, rootDirOffset, rootDirBytes, dataOffset, clusterBytes, totalClusters }
}

function readGeometry(buf: Buffer): Fat12Geometry {
  const bytesPerSector = buf.readUInt16LE(11)
  const sectorsPerCluster = buf.readUInt8(13)
  const reservedSectors = buf.readUInt16LE(14)
  const fatCount = buf.readUInt8(16)
  const rootEntries = buf.readUInt16LE(17)
  let totalSectors = buf.readUInt16LE(19)
  if (totalSectors === 0) totalSectors = buf.readUInt32LE(32)
  return {
    bytesPerSector,
    sectorsPerCluster,
    reservedSectors,
    fatCount,
    rootEntries,
    totalSectors,
    mediaDescriptor: buf.readUInt8(21),
    sectorsPerFat: buf.readUInt16LE(22),
    sectorsPerTrack: buf.readUInt16LE(24),
    heads: buf.readUInt16LE(26),
  }
}

function readLayout(buf: Buffer): Layout {
  return layoutFromGeometry(readGeometry(buf))
}

function clusterOffset(layout: Layout, cluster: number): number {
  return layout.dataOffset + (cluster - 2) * layout.clusterBytes
}

function readFatEntry(buf: Buffer, layout: Layout, cluster: number): number {
  const fatOffset = layout.reservedSectors * layout.bytesPerSector
  const byteOffset = fatOffset + Math.floor(cluster * 1.5)
  if (cluster % 2 === 0) return (buf[byteOffset] | (buf[byteOffset + 1] << 8)) & 0x0fff
  return (buf[byteOffset] >> 4) | (buf[byteOffset + 1] << 4)
}

function writeFatEntry(buf: Buffer, layout: Layout, cluster: number, value: number): void {
  for (let copy = 0; copy < layout.fatCount; copy++) {
    const fatOffset = (layout.reservedSectors + copy * layout.sectorsPerFat) * layout.bytesPerSector
    const byteOffset = fatOffset + Math.floor(cluster * 1.5)
    if (cluster % 2 === 0) {
      buf[byteOffset] = value & 0xff
      buf[byteOffset + 1] = (buf[byteOffset + 1] & 0xf0) | ((value >> 8) & 0x0f)
    } else {
      buf[byteOffset] = (buf[byteOffset] & 0x0f) | ((value & 0x0f) << 4)
      buf[byteOffset + 1] = (value >> 4) & 0xff
    }
  }
}

function nameToShortEntry(name: string): Buffer {
  const buf = Buffer.alloc(11, 0x20)
  const upper = name.toUpperCase()
  const dot = upper.lastIndexOf('.')
  const base = (dot === -1 ? upper : upper.slice(0, dot)).slice(0, 8)
  const ext = (dot === -1 ? '' : upper.slice(dot + 1)).slice(0, 3)
  for (let i = 0; i < base.length; i++) buf[i] = base.charCodeAt(i)
  for (let i = 0; i < ext.length; i++) buf[8 + i] = ext.charCodeAt(i)
  return buf
}

function shortEntryToName(buf: Buffer): string {
  const base = buf.subarray(0, 8).toString('ascii').trim()
  const ext = buf.subarray(8, 11).toString('ascii').trim()
  return ext ? `${base}.${ext}` : base
}

interface AbsEntry {
  absOffset: number
  name: string
  attr: number
  cluster: number
  size: number
  path: string
}

function* iterateDirectory(
  buf: Buffer,
  layout: Layout,
  region: { fixedOffset?: number; fixedLength?: number; startCluster?: number },
  prefix: string,
): Generator<AbsEntry> {
  if (region.fixedOffset !== undefined) {
    const end = region.fixedOffset + region.fixedLength!
    for (let eOff = region.fixedOffset; eOff < end; eOff += 32) {
      const first = buf[eOff]
      if (first === 0x00) return
      const entry = readEntryAt(buf, eOff, prefix)
      if (entry) {
        yield entry
        if (entry.attr & ATTR_DIR) yield* iterateDirectory(buf, layout, { startCluster: entry.cluster }, entry.path)
      }
    }
  } else {
    let cluster = region.startCluster!
    const visited = new Set<number>()
    outer: while (cluster >= 2 && !isEndOfChain(cluster) && cluster !== BAD && !visited.has(cluster)) {
      visited.add(cluster)
      const base = clusterOffset(layout, cluster)
      for (let eOff = base; eOff < base + layout.clusterBytes; eOff += 32) {
        const first = buf[eOff]
        if (first === 0x00) break outer
        const entry = readEntryAt(buf, eOff, prefix)
        if (entry) {
          yield entry
          if (entry.attr & ATTR_DIR) yield* iterateDirectory(buf, layout, { startCluster: entry.cluster }, entry.path)
        }
      }
      cluster = readFatEntry(buf, layout, cluster)
    }
  }
}

function readEntryAt(buf: Buffer, eOff: number, prefix: string): AbsEntry | null {
  const first = buf[eOff]
  if (first === 0xe5) return null
  const attr = buf[eOff + 11]
  if (attr === 0x0f || attr & ATTR_VOLUME) return null
  const name = shortEntryToName(buf.subarray(eOff, eOff + 11))
  if (name === '.' || name === '..') return null
  const cluster = buf.readUInt16LE(eOff + 26)
  const size = buf.readUInt32LE(eOff + 28)
  return { absOffset: eOff, name, attr, cluster, size, path: prefix ? `${prefix}/${name}` : name }
}

function readVolumeLabel(buf: Buffer, layout: Layout): string {
  for (let eOff = layout.rootDirOffset; eOff < layout.rootDirOffset + layout.rootDirBytes; eOff += 32) {
    if (buf[eOff] === 0x00) break
    if (buf[eOff] === 0xe5) continue
    if (buf[eOff + 11] & ATTR_VOLUME) return shortEntryToName(buf.subarray(eOff, eOff + 11))
  }
  return ''
}

function allocateClusters(buf: Buffer, layout: Layout, count: number): number[] {
  const result: number[] = []
  for (let c = 2; c < layout.totalClusters + 2 && result.length < count; c++) {
    if (readFatEntry(buf, layout, c) === FREE) result.push(c)
  }
  if (result.length < count) throw new Error('Disk is full.')
  return result
}

function freeClusterChain(buf: Buffer, layout: Layout, startCluster: number): void {
  let cluster = startCluster
  const visited = new Set<number>()
  while (cluster >= 2 && !isEndOfChain(cluster) && cluster !== BAD && !visited.has(cluster)) {
    visited.add(cluster)
    const next = readFatEntry(buf, layout, cluster)
    writeFatEntry(buf, layout, cluster, FREE)
    cluster = next
  }
}

async function parse(buffer: Buffer): Promise<DiskInfo> {
  const layout = readLayout(buffer)
  let freeClusters = 0
  for (let c = 2; c < layout.totalClusters + 2; c++) {
    if (readFatEntry(buffer, layout, c) === FREE) freeClusters++
  }
  return {
    label: readVolumeLabel(buffer, layout),
    id: '',
    capacityBytes: layout.totalSectors * layout.bytesPerSector,
    freeBytes: freeClusters * layout.clusterBytes,
  }
}

async function listFiles(buffer: Buffer): Promise<DiskFile[]> {
  const layout = readLayout(buffer)
  const entries = [...iterateDirectory(buffer, layout, { fixedOffset: layout.rootDirOffset, fixedLength: layout.rootDirBytes }, '')]
  return entries.map((e) => {
    const isDir = (e.attr & ATTR_DIR) !== 0
    return {
      name: e.name,
      type: isDir ? 'DIR' : 'FILE',
      sizeBytes: isDir ? 0 : e.size,
      blocks: isDir ? 0 : e.size === 0 ? 0 : Math.ceil(e.size / layout.clusterBytes),
      path: e.path,
    }
  })
}

function readClusterChainBytes(buf: Buffer, layout: Layout, startCluster: number, byteLength: number): Buffer {
  if (startCluster < 2) return Buffer.alloc(0)
  const chunks: Buffer[] = []
  let cluster = startCluster
  const visited = new Set<number>()
  let remaining = byteLength
  while (cluster >= 2 && !isEndOfChain(cluster) && cluster !== BAD && !visited.has(cluster) && remaining > 0) {
    visited.add(cluster)
    const off = clusterOffset(layout, cluster)
    const take = Math.min(layout.clusterBytes, remaining)
    chunks.push(buf.subarray(off, off + take))
    remaining -= take
    cluster = readFatEntry(buf, layout, cluster)
  }
  return Buffer.concat(chunks)
}

async function readFile(buffer: Buffer, path: string): Promise<Buffer> {
  const layout = readLayout(buffer)
  const target = path.trim()
  for (const entry of iterateDirectory(
    buffer,
    layout,
    { fixedOffset: layout.rootDirOffset, fixedLength: layout.rootDirBytes },
    '',
  )) {
    if (entry.path === target && !(entry.attr & ATTR_DIR)) {
      return readClusterChainBytes(buffer, layout, entry.cluster, entry.size)
    }
  }
  throw new Error(`File "${path}" not found.`)
}

async function writeFile(buffer: Buffer, file: SourceFile, target: WriteTarget): Promise<Buffer> {
  const buf = Buffer.from(buffer)
  const layout = readLayout(buf)

  let clusters: number[] = []
  if (file.data.length > 0) {
    const clusterCount = Math.ceil(file.data.length / layout.clusterBytes)
    clusters = allocateClusters(buf, layout, clusterCount)
    clusters.forEach((c, i) => {
      const off = clusterOffset(layout, c)
      const chunk = file.data.subarray(i * layout.clusterBytes, (i + 1) * layout.clusterBytes)
      chunk.copy(buf, off)
      writeFatEntry(buf, layout, c, i === clusters.length - 1 ? 0xfff : clusters[i + 1])
    })
  }

  let slotOffset = -1
  for (let eOff = layout.rootDirOffset; eOff < layout.rootDirOffset + layout.rootDirBytes; eOff += 32) {
    if (buf[eOff] === 0x00 || buf[eOff] === 0xe5) {
      slotOffset = eOff
      break
    }
  }
  if (slotOffset === -1) throw new Error('Root directory is full.')

  nameToShortEntry(target.name).copy(buf, slotOffset)
  buf[slotOffset + 11] = 0x20
  buf.writeUInt16LE(clusters[0] ?? 0, slotOffset + 26)
  buf.writeUInt32LE(file.data.length, slotOffset + 28)

  return buf
}

async function deleteFile(buffer: Buffer, fileName: string): Promise<Buffer> {
  const buf = Buffer.from(buffer)
  const layout = readLayout(buf)
  const target = fileName.trim().toUpperCase()

  for (const entry of iterateDirectory(buf, layout, { fixedOffset: layout.rootDirOffset, fixedLength: layout.rootDirBytes }, '')) {
    if (entry.name === target) {
      if (entry.cluster >= 2) freeClusterChain(buf, layout, entry.cluster)
      buf[entry.absOffset] = 0xe5
      return buf
    }
  }
  throw new Error(`File "${fileName}" not found.`)
}

async function format(geo: Fat12Geometry, opts: FormatOpts): Promise<Buffer> {
  const buf = Buffer.alloc(geo.totalSectors * geo.bytesPerSector, 0x00)
  buf[0] = 0xeb
  buf[1] = 0x3c
  buf[2] = 0x90
  buf.write('IMAGINE ', 3, 'ascii')
  buf.writeUInt16LE(geo.bytesPerSector, 11)
  buf.writeUInt8(geo.sectorsPerCluster, 13)
  buf.writeUInt16LE(geo.reservedSectors, 14)
  buf.writeUInt8(geo.fatCount, 16)
  buf.writeUInt16LE(geo.rootEntries, 17)
  buf.writeUInt16LE(geo.totalSectors < 0x10000 ? geo.totalSectors : 0, 19)
  buf.writeUInt8(geo.mediaDescriptor, 21)
  buf.writeUInt16LE(geo.sectorsPerFat, 22)
  buf.writeUInt16LE(geo.sectorsPerTrack, 24)
  buf.writeUInt16LE(geo.heads, 26)
  buf[510] = 0x55
  buf[511] = 0xaa

  const layout = layoutFromGeometry(geo)
  for (let copy = 0; copy < geo.fatCount; copy++) {
    const fatOffset = (geo.reservedSectors + copy * geo.sectorsPerFat) * geo.bytesPerSector
    buf[fatOffset] = geo.mediaDescriptor
    buf[fatOffset + 1] = 0xff
    buf[fatOffset + 2] = 0xff
  }

  if (opts.label) {
    nameToShortEntry(opts.label).copy(buf, layout.rootDirOffset)
    buf[layout.rootDirOffset + 11] = ATTR_VOLUME
  }

  return buf
}

export function createFat12Plugin(id: DiskFormat, systems: System[], geometry: Fat12Geometry): DiskFormatPlugin {
  return {
    id,
    systems,
    capabilities: { read: true, write: true, format: true },
    parse,
    listFiles,
    readFile,
    writeFile,
    deleteFile,
    format: (opts) => format(geometry, opts),
  }
}

export const stPlugin = createFat12Plugin('st', ['atariST'], {
  bytesPerSector: 512,
  sectorsPerCluster: 2,
  reservedSectors: 1,
  fatCount: 2,
  rootEntries: 112,
  totalSectors: 1440,
  mediaDescriptor: 0xf9,
  sectorsPerFat: 5,
  sectorsPerTrack: 9,
  heads: 2,
})

export const imgPlugin = createFat12Plugin('img', ['dos'], {
  bytesPerSector: 512,
  sectorsPerCluster: 1,
  reservedSectors: 1,
  fatCount: 2,
  rootEntries: 224,
  totalSectors: 2880,
  mediaDescriptor: 0xf0,
  sectorsPerFat: 9,
  sectorsPerTrack: 18,
  heads: 2,
})
