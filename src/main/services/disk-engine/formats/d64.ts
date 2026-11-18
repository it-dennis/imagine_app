import type { DiskFormatPlugin } from '../types'
import { textToPetscii } from '../petscii'
import { createCbmPlugin, initBam, setSectorUsed, type CbmGeometry } from './cbm'

// Standard 35-track D64 (1541), no error-info bytes: 683 sectors * 256 bytes.
const TRACKS = 35
export const D64_BYTES = 174848
const BAM_TRACK = 18

/** Sectors per track in the 1541 zones; shared with the D71, whose second side repeats the layout. */
export function d64SectorsInTrack(track: number): number {
  if (track < 1 || track > 35) throw new Error(`Invalid track ${track}`)
  if (track <= 17) return 21
  if (track <= 24) return 19
  if (track <= 30) return 18
  return 17
}

const TRACK_START = ((): number[] => {
  const start = new Array(TRACKS + 1).fill(0)
  let cum = 0
  for (let t = 1; t <= TRACKS; t++) {
    start[t] = cum
    cum += d64SectorsInTrack(t)
  }
  return start
})()

const offset = (track: number, sector: number) => (TRACK_START[track] + sector) * 256

/** Header fields shared by D64 and D71: DOS version, disk name, id and the "2A" format marker. */
export function writeStandardHeader(buf: Buffer, headerOffset: number, label: string, id: string): void {
  buf[headerOffset] = BAM_TRACK
  buf[headerOffset + 1] = 1
  buf[headerOffset + 2] = 0x41
  textToPetscii(label, 16).copy(buf, headerOffset + 0x90)
  buf[headerOffset + 0xa0] = 0xa0
  buf[headerOffset + 0xa1] = 0xa0
  textToPetscii(id, 2).copy(buf, headerOffset + 0xa2)
  buf[headerOffset + 0xa4] = 0xa0
  textToPetscii('2A', 2).copy(buf, headerOffset + 0xa5)
  for (let i = 0xa7; i <= 0xaa; i++) buf[headerOffset + i] = 0xa0
}

export const d64Geometry: CbmGeometry = {
  id: 'd64',
  systems: ['c64', 'vic20', 'plus4', 'c128'],
  totalBytes: D64_BYTES,
  tracks: TRACKS,
  sectorsInTrack: d64SectorsInTrack,
  offset,
  header: { track: BAM_TRACK, sector: 0 },
  dir: { track: BAM_TRACK, sector: 1 },
  reservedTracks: [BAM_TRACK],
  bam: (track) => {
    const base = offset(BAM_TRACK, 0) + 4 + (track - 1) * 4
    return { count: base, bits: base + 1 }
  },
  nameOffset: 0x90,
  idOffset: 0xa2,
  format({ label, id }) {
    const buf = Buffer.alloc(D64_BYTES, 0x00)
    initBam(d64Geometry, buf)
    writeStandardHeader(buf, offset(BAM_TRACK, 0), label, id)
    const dirBase = offset(BAM_TRACK, 1)
    buf[dirBase] = 0x00
    buf[dirBase + 1] = 0xff
    setSectorUsed(d64Geometry, buf, BAM_TRACK, 0, true)
    setSectorUsed(d64Geometry, buf, BAM_TRACK, 1, true)
    return buf
  },
}

export const d64Plugin: DiskFormatPlugin = createCbmPlugin(d64Geometry)
