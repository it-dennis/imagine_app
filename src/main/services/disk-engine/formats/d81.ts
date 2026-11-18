import type { DiskFormatPlugin } from '../types'
import { textToPetscii } from '../petscii'
import { createCbmPlugin, initBam, setSectorUsed, type CbmGeometry } from './cbm'

// D81 (1581): 80 tracks of 40 sectors. Track 40 holds the header (40/0), two BAM sectors (40/1 for tracks 1-40,
// 40/2 for tracks 41-80; 6 bytes per track: counter + 40 bitmap bits) and the directory from 40/3.
const TRACKS = 80
const SECTORS = 40
export const D81_BYTES = TRACKS * SECTORS * 256 // 819200
const HDR_TRACK = 40

const offset = (track: number, sector: number) => ((track - 1) * SECTORS + sector) * 256

export const d81Geometry: CbmGeometry = {
  id: 'd81',
  systems: ['c64', 'c128'],
  totalBytes: D81_BYTES,
  tracks: TRACKS,
  sectorsInTrack: (track) => {
    if (track < 1 || track > TRACKS) throw new Error(`Invalid D81 track ${track}`)
    return SECTORS
  },
  offset,
  header: { track: HDR_TRACK, sector: 0 },
  dir: { track: HDR_TRACK, sector: 3 },
  reservedTracks: [HDR_TRACK],
  bam: (track) => {
    const base = track <= 40 ? offset(HDR_TRACK, 1) + 0x10 + (track - 1) * 6 : offset(HDR_TRACK, 2) + 0x10 + (track - 41) * 6
    return { count: base, bits: base + 1 }
  },
  nameOffset: 4,
  idOffset: 0x16,
  format({ label, id }) {
    const buf = Buffer.alloc(D81_BYTES, 0x00)
    initBam(d81Geometry, buf)

    const head = offset(HDR_TRACK, 0)
    buf[head] = HDR_TRACK
    buf[head + 1] = 3
    buf[head + 2] = 0x44 // 'D'
    textToPetscii(label, 16).copy(buf, head + 4)
    buf[head + 0x14] = 0xa0
    buf[head + 0x15] = 0xa0
    textToPetscii(id, 2).copy(buf, head + 0x16)
    buf[head + 0x18] = 0xa0
    textToPetscii('3D', 2).copy(buf, head + 0x19)
    buf[head + 0x1b] = 0xa0
    buf[head + 0x1c] = 0xa0

    for (const [sector, next] of [[1, 2], [2, 0]] as const) {
      const bam = offset(HDR_TRACK, sector)
      buf[bam] = next === 0 ? 0 : HDR_TRACK
      buf[bam + 1] = next === 0 ? 0xff : next
      buf[bam + 2] = 0x44
      buf[bam + 3] = 0xbb
      textToPetscii(id, 2).copy(buf, bam + 4)
      buf[bam + 6] = 0xc0 // I/O byte: verify on, CRC check on
    }
    const dir = offset(HDR_TRACK, 3)
    buf[dir] = 0x00
    buf[dir + 1] = 0xff
    for (let s = 0; s <= 3; s++) setSectorUsed(d81Geometry, buf, HDR_TRACK, s, true)
    return buf
  },
}

export const d81Plugin: DiskFormatPlugin = createCbmPlugin(d81Geometry)
