import type { DiskFile } from '../../../../shared/types'
import type { DiskFormatPlugin, DiskInfo, FormatOpts, SourceFile, WriteTarget } from '../types'

// Amiga OFS/FFS floppy filesystem. Structurally faithful to the documented
// block layout (root/file-header/data/bitmap blocks, hash-table directories,
// AmigaDOS-style checksums) and self-verified via roundtrip; not cross-checked
// against real Amiga tooling since none is available in this environment.

const BLOCK_SIZE = 512
const T_HEADER = 2
const T_DATA = 8
const T_LIST = 16
const ST_ROOT = 1
const ST_USERDIR = 2
const ST_FILE = -3

interface AdfContext {
  totalBlocks: number
  rootBlock: number
  bitmapBlock: number
  ffs: boolean
}

function blockOffset(n: number): number {
  return n * BLOCK_SIZE
}

function readContext(buf: Buffer): AdfContext {
  const totalBlocks = Math.floor(buf.length / BLOCK_SIZE)
  const rootBlock = Math.floor(totalBlocks / 2)
  const ffs = (buf[3] & 1) !== 0
  const bitmapBlock = buf.readUInt32BE(blockOffset(rootBlock) + 316)
  return { totalBlocks, rootBlock, bitmapBlock, ffs }
}

function checksum(buf: Buffer, block: number, skipLongIndex: number): number {
  const base = blockOffset(block)
  let sum = 0
  for (let i = 0; i < 128; i++) {
    if (i === skipLongIndex) continue
    sum = (sum + buf.readInt32BE(base + i * 4)) | 0
  }
  return (-sum) | 0
}

function writeChecksum(buf: Buffer, block: number, skipLongIndex: number): void {
  buf.writeInt32BE(checksum(buf, block, skipLongIndex), blockOffset(block) + skipLongIndex * 4)
}

function hashOf(name: string): number {
  const upper = name.toUpperCase()
  let hash = upper.length
  for (let i = 0; i < upper.length; i++) hash = (hash * 13 + upper.charCodeAt(i)) & 0x7ff
  return hash % 72
}

function bitIndex(block: number): { longIndex: number; bit: number } {
  const rel = block - 2
  return { longIndex: Math.floor(rel / 32), bit: rel % 32 }
}

function isBlockFree(buf: Buffer, bitmapBlock: number, block: number): boolean {
  const { longIndex, bit } = bitIndex(block)
  const word = buf.readUInt32BE(blockOffset(bitmapBlock) + 4 + longIndex * 4)
  return ((word >>> bit) & 1) === 1
}

function setBlockUsed(buf: Buffer, bitmapBlock: number, block: number, used: boolean): void {
  const { longIndex, bit } = bitIndex(block)
  const off = blockOffset(bitmapBlock) + 4 + longIndex * 4
  let word = buf.readUInt32BE(off)
  word = used ? word & ~(1 << bit) : word | (1 << bit)
  buf.writeUInt32BE(word >>> 0, off)
}

function allocateBlocks(buf: Buffer, ctx: AdfContext, count: number): number[] {
  const result: number[] = []
  for (let b = 2; b < ctx.totalBlocks && result.length < count; b++) {
    if (b === ctx.rootBlock || b === ctx.bitmapBlock) continue
    if (isBlockFree(buf, ctx.bitmapBlock, b)) {
      setBlockUsed(buf, ctx.bitmapBlock, b, true)
      result.push(b)
    }
  }
  if (result.length < count) throw new Error('Disk is full.')
  return result
}

function addEntryToDirectory(buf: Buffer, dirBlock: number, entryBlock: number, name: string): void {
  const bucket = hashOf(name)
  const htOffset = blockOffset(dirBlock) + 24 + bucket * 4
  const existingHead = buf.readUInt32BE(htOffset)
  buf.writeUInt32BE(existingHead, blockOffset(entryBlock) + 496) // hash_chain
  buf.writeUInt32BE(entryBlock, htOffset)
}

interface AdfEntry {
  block: number
  name: string
  isDir: boolean
  size: number
}

function readDirectoryEntries(buf: Buffer, dirBlock: number): AdfEntry[] {
  const entries: AdfEntry[] = []
  const htBase = blockOffset(dirBlock) + 24
  for (let b = 0; b < 72; b++) {
    let block = buf.readUInt32BE(htBase + b * 4)
    while (block !== 0) {
      const base = blockOffset(block)
      const secType = buf.readInt32BE(base + 508)
      const nameLen = buf[base + 432]
      const name = buf.toString('latin1', base + 433, base + 433 + nameLen)
      const size = buf.readUInt32BE(base + 12)
      entries.push({ block, name, isDir: secType === ST_USERDIR, size })
      block = buf.readUInt32BE(base + 496)
    }
  }
  return entries
}

function countDataBlocks(buf: Buffer, headerBlock: number): number {
  let count = 0
  let block = headerBlock
  while (block !== 0) {
    const base = blockOffset(block)
    count += buf.readInt32BE(base + 8)
    block = buf.readUInt32BE(base + 504)
  }
  return count
}

function readFileData(buf: Buffer, headerBlock: number, ffs: boolean, totalSize: number): Buffer {
  const dataBlockNumbers: number[] = []
  let block = headerBlock
  while (block !== 0) {
    const base = blockOffset(block)
    const highSeq = buf.readInt32BE(base + 8)
    for (let i = 0; i < highSeq; i++) dataBlockNumbers.push(buf.readUInt32BE(base + 24 + (71 - i) * 4))
    block = buf.readUInt32BE(base + 504)
  }
  const chunks = dataBlockNumbers.map((dBlock) => {
    const base = blockOffset(dBlock)
    if (ffs) return buf.subarray(base, base + BLOCK_SIZE)
    const dataSize = buf.readInt32BE(base + 12)
    return buf.subarray(base + 24, base + 24 + dataSize)
  })
  return Buffer.concat(chunks).subarray(0, totalSize)
}

function freeFileBlocks(buf: Buffer, ctx: AdfContext, headerBlock: number): void {
  let block = headerBlock
  while (block !== 0) {
    const base = blockOffset(block)
    const highSeq = buf.readInt32BE(base + 8)
    for (let i = 0; i < highSeq; i++) setBlockUsed(buf, ctx.bitmapBlock, buf.readUInt32BE(base + 24 + (71 - i) * 4), false)
    const next = buf.readUInt32BE(base + 504)
    setBlockUsed(buf, ctx.bitmapBlock, block, false)
    block = next
  }
}

async function parse(buffer: Buffer): Promise<DiskInfo> {
  const ctx = readContext(buffer)
  const base = blockOffset(ctx.rootBlock)
  const nameLen = buffer[base + 432]
  const label = buffer.toString('latin1', base + 433, base + 433 + nameLen)
  let freeBlocks = 0
  for (let b = 2; b < ctx.totalBlocks; b++) {
    if (b === ctx.rootBlock || b === ctx.bitmapBlock) continue
    if (isBlockFree(buffer, ctx.bitmapBlock, b)) freeBlocks++
  }
  return {
    label,
    id: ctx.ffs ? 'FFS' : 'OFS',
    capacityBytes: ctx.totalBlocks * BLOCK_SIZE,
    freeBytes: freeBlocks * BLOCK_SIZE,
  }
}

async function listFiles(buffer: Buffer): Promise<DiskFile[]> {
  const ctx = readContext(buffer)
  const out: DiskFile[] = []
  const walk = (dirBlock: number, prefix: string) => {
    for (const e of readDirectoryEntries(buffer, dirBlock)) {
      const path = prefix ? `${prefix}/${e.name}` : e.name
      out.push({
        name: e.name,
        type: e.isDir ? 'DIR' : 'FILE',
        sizeBytes: e.isDir ? 0 : e.size,
        blocks: e.isDir ? 0 : countDataBlocks(buffer, e.block),
        path,
      })
      if (e.isDir) walk(e.block, path)
    }
  }
  walk(ctx.rootBlock, '')
  return out
}

async function writeFile(buffer: Buffer, file: SourceFile, target: WriteTarget): Promise<Buffer> {
  const buf = Buffer.from(buffer)
  const ctx = readContext(buf)
  const dataUnit = ctx.ffs ? 512 : 488
  const dataBlockCount = file.data.length === 0 ? 0 : Math.ceil(file.data.length / dataUnit)
  const headerCount = Math.max(1, Math.ceil(dataBlockCount / 72))

  const blocks = allocateBlocks(buf, ctx, dataBlockCount + headerCount)
  const headerBlocks = blocks.slice(0, headerCount)
  const dataBlocks = blocks.slice(headerCount)

  dataBlocks.forEach((blockNum, i) => {
    const base = blockOffset(blockNum)
    const chunk = file.data.subarray(i * dataUnit, i * dataUnit + dataUnit)
    if (ctx.ffs) {
      chunk.copy(buf, base)
    } else {
      buf.writeInt32BE(T_DATA, base)
      buf.writeUInt32BE(headerBlocks[0], base + 4)
      buf.writeInt32BE(i + 1, base + 8)
      buf.writeInt32BE(chunk.length, base + 12)
      buf.writeUInt32BE(i === dataBlocks.length - 1 ? 0 : dataBlocks[i + 1], base + 16)
      chunk.copy(buf, base + 24)
      writeChecksum(buf, blockNum, 5)
    }
  })

  headerBlocks.forEach((hBlock, hi) => {
    const base = blockOffset(hBlock)
    const isMain = hi === 0
    buf.writeInt32BE(isMain ? T_HEADER : T_LIST, base)
    buf.writeUInt32BE(hBlock, base + 4)
    const sliceStart = hi * 72
    const sliceCount = Math.max(0, Math.min(sliceStart + 72, dataBlocks.length) - sliceStart)
    buf.writeInt32BE(sliceCount, base + 8)
    for (let i = 0; i < sliceCount; i++) {
      buf.writeUInt32BE(dataBlocks[sliceStart + i], base + 24 + (71 - i) * 4)
    }
    if (isMain) {
      buf.writeUInt32BE(dataBlocks[0] ?? 0, base + 16)
      buf.writeUInt32BE(file.data.length, base + 12)
      const nameBuf = Buffer.from(target.name.toUpperCase().slice(0, 30), 'latin1')
      buf[base + 432] = nameBuf.length
      nameBuf.copy(buf, base + 433)
    }
    buf.writeUInt32BE(hi < headerBlocks.length - 1 ? headerBlocks[hi + 1] : 0, base + 504)
    buf.writeInt32BE(ST_FILE, base + 508)
    writeChecksum(buf, hBlock, 5)
  })

  addEntryToDirectory(buf, ctx.rootBlock, headerBlocks[0], target.name.toUpperCase())
  writeChecksum(buf, ctx.rootBlock, 5)

  return buf
}

async function deleteFile(buffer: Buffer, fileName: string): Promise<Buffer> {
  const buf = Buffer.from(buffer)
  const ctx = readContext(buf)
  const target = fileName.trim().toUpperCase()

  function searchDir(dirBlock: number): boolean {
    const htBase = blockOffset(dirBlock) + 24
    for (let b = 0; b < 72; b++) {
      const headOff = htBase + b * 4
      let prevOff = headOff
      let block = buf.readUInt32BE(headOff)
      while (block !== 0) {
        const base = blockOffset(block)
        const nameLen = buf[base + 432]
        const name = buf.toString('latin1', base + 433, base + 433 + nameLen)
        const next = buf.readUInt32BE(base + 496)
        const secType = buf.readInt32BE(base + 508)
        if (name === target) {
          buf.writeUInt32BE(next, prevOff)
          if (secType !== ST_USERDIR) freeFileBlocks(buf, ctx, block)
          setBlockUsed(buf, ctx.bitmapBlock, block, false)
          return true
        }
        if (secType === ST_USERDIR && searchDir(block)) return true
        prevOff = base + 496
        block = next
      }
    }
    return false
  }

  if (!searchDir(ctx.rootBlock)) throw new Error(`File "${fileName}" not found.`)
  writeChecksum(buf, ctx.rootBlock, 5)
  return buf
}

async function format(ffs: boolean, opts: FormatOpts): Promise<Buffer> {
  const totalBlocks = 1760 // 880K DD floppy
  const buf = Buffer.alloc(totalBlocks * BLOCK_SIZE, 0)
  const rootBlock = Math.floor(totalBlocks / 2)
  const bitmapBlock = rootBlock + 1

  buf.write('DOS', 0, 'ascii')
  buf[3] = ffs ? 1 : 0

  const rBase = blockOffset(rootBlock)
  buf.writeInt32BE(T_HEADER, rBase)
  buf.writeInt32BE(72, rBase + 12)
  buf.writeInt32BE(-1, rBase + 312)
  buf.writeUInt32BE(bitmapBlock, rBase + 316)
  const nameBuf = Buffer.from((opts.label || 'UNTITLED').toUpperCase().slice(0, 30), 'latin1')
  buf[rBase + 432] = nameBuf.length
  nameBuf.copy(buf, rBase + 433)
  buf.writeInt32BE(ST_ROOT, rBase + 508)

  const bmBase = blockOffset(bitmapBlock)
  buf.fill(0xff, bmBase + 4, bmBase + BLOCK_SIZE)
  writeChecksum(buf, bitmapBlock, 0)
  writeChecksum(buf, rootBlock, 5)

  const ctx: AdfContext = { totalBlocks, rootBlock, bitmapBlock, ffs }
  setBlockUsed(buf, bitmapBlock, rootBlock, true)
  setBlockUsed(buf, bitmapBlock, bitmapBlock, true)
  void ctx
  writeChecksum(buf, bitmapBlock, 0)

  return buf
}

function resolveEntry(buffer: Buffer, rootBlock: number, path: string): AdfEntry {
  const segments = path.trim().toUpperCase().split('/').filter(Boolean)
  let dirBlock = rootBlock
  let match: AdfEntry | undefined
  for (let i = 0; i < segments.length; i++) {
    const entries = readDirectoryEntries(buffer, dirBlock)
    match = entries.find((e) => e.name === segments[i])
    if (!match) throw new Error(`File "${path}" not found.`)
    const isLast = i === segments.length - 1
    if (isLast) {
      if (match.isDir) throw new Error(`"${path}" is a directory.`)
    } else {
      if (!match.isDir) throw new Error(`"${path}" is not a directory.`)
      dirBlock = match.block
    }
  }
  if (!match) throw new Error(`File "${path}" not found.`)
  return match
}

async function readFile(buffer: Buffer, path: string): Promise<Buffer> {
  const ctx = readContext(buffer)
  const entry = resolveEntry(buffer, ctx.rootBlock, path)
  return readFileData(buffer, entry.block, ctx.ffs, entry.size)
}

export const adfPlugin: DiskFormatPlugin = {
  id: 'adf',
  systems: ['amiga'],
  capabilities: { read: true, write: true, format: true },
  parse,
  listFiles,
  readFile,
  writeFile,
  deleteFile,
  format: (opts) => format(true, opts),
}
