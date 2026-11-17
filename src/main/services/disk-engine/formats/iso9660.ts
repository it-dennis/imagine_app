import type { DiskFile } from '../../../../shared/types'
import type { DiskFormatPlugin, DiskInfo } from '../types'

// Read-only ISO9660 (Level 1) browsing. Creating a new ISO goes through the
// dedicated iso-writer (a whole-folder-to-image build), not writeFile/format,
// since ISO mastering isn't an incremental "format blank, add files" process.

const SECTOR = 2048
const PVD_SECTOR = 16

function readDirectory(buf: Buffer, extentLBA: number, dataLength: number, prefix: string, out: DiskFile[]): void {
  let pos = extentLBA * SECTOR
  const end = pos + dataLength
  while (pos < end) {
    const sectorEnd = Math.ceil((pos + 1) / SECTOR) * SECTOR
    let p = pos
    while (p < sectorEnd) {
      const len = buf[p]
      if (len === 0) break
      const flags = buf[p + 25]
      const nameLen = buf[p + 32]
      const nameBytes = buf.subarray(p + 33, p + 33 + nameLen)
      const isDir = (flags & 2) !== 0
      const isSelfOrParent = nameLen === 1 && (nameBytes[0] === 0 || nameBytes[0] === 1)
      if (!isSelfOrParent) {
        let name = nameBytes.toString('ascii')
        if (!isDir) name = name.replace(/;\d+$/, '')
        const childExtent = buf.readUInt32LE(p + 2)
        const childLength = buf.readUInt32LE(p + 10)
        const path = prefix ? `${prefix}/${name}` : name
        out.push({
          name,
          type: isDir ? 'DIR' : 'FILE',
          sizeBytes: isDir ? 0 : childLength,
          blocks: isDir ? 0 : Math.ceil(childLength / SECTOR),
          path,
        })
        if (isDir) readDirectory(buf, childExtent, childLength, path, out)
      }
      p += len
    }
    pos = sectorEnd
  }
}

async function parse(buffer: Buffer): Promise<DiskInfo> {
  const pvdOffset = PVD_SECTOR * SECTOR
  const label = buffer.toString('ascii', pvdOffset + 40, pvdOffset + 72).trim()
  const totalSectors = buffer.readUInt32LE(pvdOffset + 80)
  return {
    label,
    id: '',
    capacityBytes: totalSectors * SECTOR,
    freeBytes: 0,
  }
}

async function listFiles(buffer: Buffer): Promise<DiskFile[]> {
  const pvdOffset = PVD_SECTOR * SECTOR
  const rootRecordOffset = pvdOffset + 156
  const rootExtent = buffer.readUInt32LE(rootRecordOffset + 2)
  const rootLength = buffer.readUInt32LE(rootRecordOffset + 10)
  const out: DiskFile[] = []
  readDirectory(buffer, rootExtent, rootLength, '', out)
  return out
}

function findRecord(buf: Buffer, extentLBA: number, dataLength: number, segments: string[]): { extent: number; length: number; isDir: boolean } | null {
  const [head, ...rest] = segments
  let pos = extentLBA * SECTOR
  const end = pos + dataLength
  while (pos < end) {
    const sectorEnd = Math.ceil((pos + 1) / SECTOR) * SECTOR
    let p = pos
    while (p < sectorEnd) {
      const len = buf[p]
      if (len === 0) break
      const flags = buf[p + 25]
      const nameLen = buf[p + 32]
      const nameBytes = buf.subarray(p + 33, p + 33 + nameLen)
      const isDir = (flags & 2) !== 0
      const isSelfOrParent = nameLen === 1 && (nameBytes[0] === 0 || nameBytes[0] === 1)
      if (!isSelfOrParent) {
        let name = nameBytes.toString('ascii')
        if (!isDir) name = name.replace(/;\d+$/, '')
        if (name === head) {
          const childExtent = buf.readUInt32LE(p + 2)
          const childLength = buf.readUInt32LE(p + 10)
          if (rest.length === 0) return { extent: childExtent, length: childLength, isDir }
          if (isDir) return findRecord(buf, childExtent, childLength, rest)
          return null
        }
      }
      p += len
    }
    pos = sectorEnd
  }
  return null
}

async function readFile(buffer: Buffer, path: string): Promise<Buffer> {
  const pvdOffset = PVD_SECTOR * SECTOR
  const rootRecordOffset = pvdOffset + 156
  const rootExtent = buffer.readUInt32LE(rootRecordOffset + 2)
  const rootLength = buffer.readUInt32LE(rootRecordOffset + 10)
  const found = findRecord(buffer, rootExtent, rootLength, path.split('/'))
  if (!found || found.isDir) throw new Error(`File "${path}" not found.`)
  return buffer.subarray(found.extent * SECTOR, found.extent * SECTOR + found.length)
}

async function notSupported(): Promise<never> {
  throw new Error('ISO images are created via "ISO erstellen…", not by writing into an existing image.')
}

export const isoPlugin: DiskFormatPlugin = {
  id: 'iso',
  systems: ['dos'],
  capabilities: { read: true, write: false, format: false },
  parse,
  listFiles,
  readFile,
  writeFile: notSupported,
  deleteFile: notSupported,
  format: notSupported,
}
