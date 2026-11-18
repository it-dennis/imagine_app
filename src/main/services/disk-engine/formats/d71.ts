import type { DiskFormatPlugin } from '../types'
import { createCbmPlugin, initBam, reserveTrack, setSectorUsed, type CbmGeometry } from './cbm'
import { d64SectorsInTrack, writeStandardHeader } from './d64'

// D71 (1571, double sided): 70 tracks, tracks 36-70 repeat the zone layout of 1-35. The BAM of side 0 is in
// 18/0 like on the D64; the free counters of side 1 follow at offset 0xDD of that sector and its bitmaps are
// in sector 53/0. VICE's c1541 marks all of track 53 as used, and so do we.
const TRACKS = 70
export const D71_BYTES = 349696
const BAM_TRACK = 18
const BAM2_TRACK = 53

const sectorsInTrack = (track: number) => {
  if (track < 1 || track > TRACKS) throw new Error(`Invalid D71 track ${track}`)
  return d64SectorsInTrack(track > 35 ? track - 35 : track)
}

const TRACK_START = ((): number[] => {
  const start = new Array(TRACKS + 1).fill(0)
  let cum = 0
  for (let t = 1; t <= TRACKS; t++) {
    start[t] = cum
    cum += sectorsInTrack(t)
  }
  return start
})()

const offset = (track: number, sector: number) => (TRACK_START[track] + sector) * 256

export const d71Geometry: CbmGeometry = {
  id: 'd71',
  systems: ['c64', 'c128'],
  totalBytes: D71_BYTES,
  tracks: TRACKS,
  sectorsInTrack,
  offset,
  header: { track: BAM_TRACK, sector: 0 },
  dir: { track: BAM_TRACK, sector: 1 },
  reservedTracks: [BAM_TRACK, BAM2_TRACK],
  bam: (track) => {
    if (track <= 35) {
      const base = offset(BAM_TRACK, 0) + 4 + (track - 1) * 4
      return { count: base, bits: base + 1 }
    }
    return { count: offset(BAM_TRACK, 0) + 0xdd + (track - 36), bits: offset(BAM2_TRACK, 0) + (track - 36) * 3 }
  },
  nameOffset: 0x90,
  idOffset: 0xa2,
  format({ label, id }) {
    const buf = Buffer.alloc(D71_BYTES, 0x00)
    initBam(d71Geometry, buf)
    writeStandardHeader(buf, offset(BAM_TRACK, 0), label, id)
    buf[offset(BAM_TRACK, 0) + 3] = 0x80 // double sided
    const dirBase = offset(BAM_TRACK, 1)
    buf[dirBase] = 0x00
    buf[dirBase + 1] = 0xff
    setSectorUsed(d71Geometry, buf, BAM_TRACK, 0, true)
    setSectorUsed(d71Geometry, buf, BAM_TRACK, 1, true)
    reserveTrack(d71Geometry, buf, BAM2_TRACK)
    return buf
  },
}

export const d71Plugin: DiskFormatPlugin = createCbmPlugin(d71Geometry)
