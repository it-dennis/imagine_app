import type { DiskFormatPlugin } from '../types'
import { stPlugin } from './fat12'

// MSA is a compressed container around a plain .ST sector image: 10-byte
// header (id, sectorsPerTrack, sides-1, startTrack, endTrack) followed by
// one RLE-compressed (0xE5 value lo hi) chunk per track/side, or the raw
// track if compression didn't help. The filesystem itself is delegated
// entirely to the ST (FAT12) plugin — MSA is just a wrapper.

const MSA_ID = 0x0e0f
const SECTOR_SIZE = 512

function decompressTrack(data: Buffer, trackSize: number): Buffer {
  if (data.length === trackSize) return Buffer.from(data)
  const out: number[] = []
  let i = 0
  while (i < data.length) {
    const b = data[i]
    if (b === 0xe5) {
      const value = data[i + 1]
      const count = data.readUInt16BE(i + 2)
      for (let k = 0; k < count; k++) out.push(value)
      i += 4
    } else {
      out.push(b)
      i += 1
    }
  }
  return Buffer.from(out)
}

function compressTrack(data: Buffer): Buffer {
  const out: number[] = []
  let i = 0
  while (i < data.length) {
    const b = data[i]
    let runLen = 1
    while (i + runLen < data.length && data[i + runLen] === b && runLen < 0xffff) runLen++
    if (b === 0xe5 || runLen >= 4) {
      out.push(0xe5, b, (runLen >> 8) & 0xff, runLen & 0xff)
      i += runLen
    } else {
      out.push(b)
      i += 1
    }
  }
  const compressed = Buffer.from(out)
  return compressed.length < data.length ? compressed : Buffer.from(data)
}

function msaGeometry(buf: Buffer): { sectorsPerTrack: number; heads: number; startTrack: number; endTrack: number } {
  return {
    sectorsPerTrack: buf.readUInt16BE(2),
    heads: buf.readUInt16BE(4) + 1,
    startTrack: buf.readUInt16BE(6),
    endTrack: buf.readUInt16BE(8),
  }
}

function msaToSt(buf: Buffer): Buffer {
  const geo = msaGeometry(buf)
  const trackSize = geo.sectorsPerTrack * SECTOR_SIZE
  const tracks: Buffer[] = []
  let pos = 10
  for (let t = geo.startTrack; t <= geo.endTrack; t++) {
    for (let s = 0; s < geo.heads; s++) {
      const len = buf.readUInt16BE(pos)
      pos += 2
      const chunk = buf.subarray(pos, pos + len)
      pos += len
      tracks.push(decompressTrack(chunk, trackSize))
    }
  }
  return Buffer.concat(tracks)
}

function stToMsa(stBuf: Buffer, geo: { sectorsPerTrack: number; heads: number }): Buffer {
  const trackSize = geo.sectorsPerTrack * SECTOR_SIZE
  const totalTracks = Math.floor(stBuf.length / trackSize / geo.heads)
  const header = Buffer.alloc(10)
  header.writeUInt16BE(MSA_ID, 0)
  header.writeUInt16BE(geo.sectorsPerTrack, 2)
  header.writeUInt16BE(geo.heads - 1, 4)
  header.writeUInt16BE(0, 6)
  header.writeUInt16BE(totalTracks - 1, 8)

  const parts: Buffer[] = [header]
  let pos = 0
  for (let t = 0; t < totalTracks; t++) {
    for (let s = 0; s < geo.heads; s++) {
      const track = stBuf.subarray(pos, pos + trackSize)
      pos += trackSize
      const compressed = compressTrack(track)
      const lenBuf = Buffer.alloc(2)
      lenBuf.writeUInt16BE(compressed.length, 0)
      parts.push(lenBuf, compressed)
    }
  }
  return Buffer.concat(parts)
}

const STANDARD_GEOMETRY = { sectorsPerTrack: 9, heads: 2 }

export const msaPlugin: DiskFormatPlugin = {
  id: 'msa',
  systems: ['atariST'],
  capabilities: { read: true, write: true, format: true },
  parse: (buffer) => stPlugin.parse(msaToSt(buffer)),
  listFiles: (buffer) => stPlugin.listFiles(msaToSt(buffer)),
  readFile: (buffer, path) => stPlugin.readFile(msaToSt(buffer), path),
  writeFile: async (buffer, file, target) => {
    const st = await stPlugin.writeFile(msaToSt(buffer), file, target)
    const { sectorsPerTrack, heads } = msaGeometry(buffer)
    return stToMsa(st, { sectorsPerTrack, heads })
  },
  deleteFile: async (buffer, fileName) => {
    const st = await stPlugin.deleteFile(msaToSt(buffer), fileName)
    const { sectorsPerTrack, heads } = msaGeometry(buffer)
    return stToMsa(st, { sectorsPerTrack, heads })
  },
  format: async (opts) => {
    const st = await stPlugin.format(opts)
    return stToMsa(st, STANDARD_GEOMETRY)
  },
}
