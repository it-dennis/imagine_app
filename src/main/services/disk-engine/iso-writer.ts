import { readFile, readdir, stat } from 'fs/promises'
import { join } from 'path'

// Builds a Level-1 ISO9660 image (PVD + path tables + directory records +
// file data) from a source folder in one pass. Self-verified by reading the
// result back with our own iso9660 reader; not cross-checked against real
// mastering tools or optical drives.

const SECTOR = 2048

interface Node {
  name: string
  isDir: boolean
  hostPath: string
  size: number
  children: Node[]
  parent: Node | null
  dirNumber?: number
  lba?: number
  sectors?: number
}

function sanitizeName(name: string, isDir: boolean): string {
  const upper = name.toUpperCase().replace(/[^A-Z0-9_.]/g, '_')
  if (isDir) return upper.replace(/\./g, '_').slice(0, 30) || '_'
  const dot = upper.lastIndexOf('.')
  const stem = (dot === -1 ? upper : upper.slice(0, dot)).replace(/\./g, '_').slice(0, 24) || '_'
  const ext = dot === -1 ? '' : upper.slice(dot + 1).slice(0, 3)
  return `${stem}${ext ? '.' + ext : ''};1`
}

async function buildTree(hostPath: string, name: string, isDir: boolean, parent: Node | null): Promise<Node> {
  if (!isDir) {
    const stats = await stat(hostPath)
    return { name: sanitizeName(name, false), isDir: false, hostPath, size: stats.size, children: [], parent }
  }
  const node: Node = { name: sanitizeName(name, true), isDir: true, hostPath, size: 0, children: [], parent }
  const entries = await readdir(hostPath, { withFileTypes: true })
  const kids: Node[] = []
  for (const entry of entries) {
    kids.push(await buildTree(join(hostPath, entry.name), entry.name, entry.isDirectory(), node))
  }
  kids.sort((a, b) => a.name.localeCompare(b.name))
  node.children = kids
  return node
}

function collectDirsBFS(root: Node): Node[] {
  const list: Node[] = []
  const queue: Node[] = [root]
  while (queue.length) {
    const n = queue.shift()!
    list.push(n)
    for (const c of n.children) if (c.isDir) queue.push(c)
  }
  return list
}

function recordLength(nameLen: number): number {
  const len = 33 + nameLen
  return len + (len % 2)
}

function packDirectorySectors(childNameLens: number[]): number {
  const lens = [1, 1, ...childNameLens].map(recordLength)
  let remaining = SECTOR
  let sectors = 1
  for (const len of lens) {
    if (len > remaining) {
      sectors++
      remaining = SECTOR
    }
    remaining -= len
  }
  return sectors
}

function writeRecordAt(buf: Buffer, offset: number, extentLBA: number, dataLength: number, isDir: boolean, name: Buffer): number {
  const nameLen = name.length
  const len = recordLength(nameLen)
  buf[offset] = len
  buf[offset + 1] = 0
  buf.writeUInt32LE(extentLBA, offset + 2)
  buf.writeUInt32BE(extentLBA, offset + 6)
  buf.writeUInt32LE(dataLength, offset + 10)
  buf.writeUInt32BE(dataLength, offset + 14)
  buf[offset + 25] = isDir ? 2 : 0
  buf.writeUInt16LE(1, offset + 28)
  buf.writeUInt16BE(1, offset + 30)
  buf[offset + 32] = nameLen
  name.copy(buf, offset + 33)
  return len
}

function writeDirectoryRecords(buf: Buffer, dir: Node): void {
  const base = dir.lba! * SECTOR
  let pos = base
  let sectorEnd = base + SECTOR
  const put = (extentLBA: number, dataLength: number, isDir: boolean, name: Buffer) => {
    const len = recordLength(name.length)
    if (pos + len > sectorEnd) {
      pos = sectorEnd
      sectorEnd += SECTOR
    }
    writeRecordAt(buf, pos, extentLBA, dataLength, isDir, name)
    pos += len
  }

  put(dir.lba!, dir.sectors! * SECTOR, true, Buffer.from([0]))
  const parent = dir.parent ?? dir
  put(parent.lba!, parent.sectors! * SECTOR, true, Buffer.from([1]))
  for (const child of dir.children) {
    const nameBuf = Buffer.from(child.name, 'ascii')
    if (child.isDir) put(child.lba!, child.sectors! * SECTOR, true, nameBuf)
    else put(child.lba!, child.size, false, nameBuf)
  }
}

function writePathTable(buf: Buffer, dirs: Node[], startLBA: number, little: boolean): void {
  let offset = startLBA * SECTOR
  for (const d of dirs) {
    const nameBuf = d.parent === null ? Buffer.from([0]) : Buffer.from(d.name, 'ascii')
    const nameLen = nameBuf.length
    buf[offset] = nameLen
    buf[offset + 1] = 0
    const parentNumber = d.parent ? d.parent.dirNumber! : 1
    if (little) {
      buf.writeUInt32LE(d.lba!, offset + 2)
      buf.writeUInt16LE(parentNumber, offset + 6)
    } else {
      buf.writeUInt32BE(d.lba!, offset + 2)
      buf.writeUInt16BE(parentNumber, offset + 6)
    }
    nameBuf.copy(buf, offset + 8)
    offset += 8 + nameLen + (nameLen % 2)
  }
}

function writeUnspecifiedDate(buf: Buffer, offset: number): void {
  buf.fill(0x30, offset, offset + 16)
  buf[offset + 16] = 0
}

function writePvd(
  buf: Buffer,
  opts: { label: string; root: Node; pathTableSize: number; pathTableLLBA: number; pathTableMLBA: number; totalSectors: number },
): void {
  const off = 16 * SECTOR
  buf[off] = 1
  buf.write('CD001', off + 1, 'ascii')
  buf[off + 6] = 1
  buf.write('IMAGINE'.padEnd(32, ' '), off + 8, 'ascii')
  buf.write(opts.label.toUpperCase().slice(0, 32).padEnd(32, ' '), off + 40, 'ascii')
  buf.writeUInt32LE(opts.totalSectors, off + 80)
  buf.writeUInt32BE(opts.totalSectors, off + 84)
  buf.writeUInt16LE(1, off + 120)
  buf.writeUInt16BE(1, off + 122)
  buf.writeUInt16LE(1, off + 124)
  buf.writeUInt16BE(1, off + 126)
  buf.writeUInt16LE(SECTOR, off + 128)
  buf.writeUInt16BE(SECTOR, off + 130)
  buf.writeUInt32LE(opts.pathTableSize, off + 132)
  buf.writeUInt32BE(opts.pathTableSize, off + 136)
  buf.writeUInt32LE(opts.pathTableLLBA, off + 140)
  buf.writeUInt32BE(opts.pathTableMLBA, off + 148)
  writeRecordAt(buf, off + 156, opts.root.lba!, opts.root.sectors! * SECTOR, true, Buffer.from([0]))
  buf.write('IMAGINEAPP'.padEnd(128, ' '), off + 190, 'ascii')
  buf.write('IMAGINE'.padEnd(128, ' '), off + 318, 'ascii')
  buf.write(''.padEnd(128, ' '), off + 446, 'ascii')
  buf.write(''.padEnd(128, ' '), off + 574, 'ascii')
  for (const dateOffset of [813, 830, 847, 864]) writeUnspecifiedDate(buf, off + dateOffset)
  buf[off + 881] = 1

  const termOff = 17 * SECTOR
  buf[termOff] = 255
  buf.write('CD001', termOff + 1, 'ascii')
  buf[termOff + 6] = 1
}

export async function buildIso9660(sourceFolder: string, label: string): Promise<Buffer> {
  const root = await buildTree(sourceFolder, '', true, null)
  const dirs = collectDirsBFS(root)
  dirs.forEach((d, i) => {
    d.dirNumber = i + 1
  })
  for (const d of dirs) {
    d.sectors = packDirectorySectors(d.children.map((c) => Buffer.byteLength(c.name, 'ascii')))
  }

  const files: Node[] = []
  const collectFiles = (n: Node) => {
    for (const c of n.children) {
      if (c.isDir) collectFiles(c)
      else files.push(c)
    }
  }
  collectFiles(root)
  for (const f of files) f.sectors = Math.max(1, Math.ceil(f.size / SECTOR))

  let pathTableSize = 0
  for (const d of dirs) {
    const nameLen = d.parent === null ? 1 : Buffer.byteLength(d.name, 'ascii')
    pathTableSize += 8 + nameLen + (nameLen % 2)
  }
  const pathTableSectors = Math.ceil(pathTableSize / SECTOR)

  let lba = 18
  const pathTableLLBA = lba
  lba += pathTableSectors
  const pathTableMLBA = lba
  lba += pathTableSectors
  for (const d of dirs) {
    d.lba = lba
    lba += d.sectors!
  }
  for (const f of files) {
    f.lba = lba
    lba += f.sectors!
  }
  const totalSectors = lba

  const buf = Buffer.alloc(totalSectors * SECTOR, 0)

  for (const f of files) {
    const data = await readFile(f.hostPath)
    data.copy(buf, f.lba! * SECTOR)
  }
  for (const d of dirs) writeDirectoryRecords(buf, d)
  writePathTable(buf, dirs, pathTableLLBA, true)
  writePathTable(buf, dirs, pathTableMLBA, false)
  writePvd(buf, { label, root, pathTableSize, pathTableLLBA, pathTableMLBA, totalSectors })

  return buf
}
