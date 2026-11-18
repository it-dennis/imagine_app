import { describe, it, expect } from 'vitest'
import { mkdtemp, writeFile, readFile, rm } from 'fs/promises'
import { spawnSync } from 'child_process'
import { existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { getPlugin } from '../../src/main/services/disk-engine'
import { assemble } from '../../src/renderer/lib/lang/assembler'
import { autostartTarget } from '../../src/main/services/emulators'

// Runs assembled programs on a real C64 ROM in VICE and checks what appears on screen. This is the strongest
// check available: the ROM LOADs and RUNs the file, so the SYS stub, the code and the disk image must all be
// right. Skipped where VICE is not installed. Opt out with IMAGINE_SKIP_ROM=1 (it opens a window briefly).
const VICE = ['C:/Program Files/Vice/x64sc.exe', 'C:/Program Files/GTK3VICE/x64sc.exe', '/usr/bin/x64sc'].find(existsSync)
const SHOT_DIR = process.env['ROM_SHOTS']

// A PNG screenshot of VICE's 384x272 frame: the C64 screen starts at (32,35) in this frame size, each
// character is 8x8 pixels. Colours below are VICE's default palette entries.
interface Png { width: number; height: number; pixel: (x: number, y: number) => [number, number, number] }
async function decodePng(buf: Buffer): Promise<Png> {
  const { default: zlib } = await import('zlib')
  let pos = 8
  let width = 0, height = 0, colorType = 0
  const idat: Buffer[] = []
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos)
    const type = buf.toString('ascii', pos + 4, pos + 8)
    const data = buf.subarray(pos + 8, pos + 8 + len)
    if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); colorType = data[9] }
    if (type === 'IDAT') idat.push(data)
    pos += 12 + len
  }
  const bpp = colorType === 6 ? 4 : colorType === 2 ? 3 : 1
  const raw = zlib.inflateSync(Buffer.concat(idat))
  const stride = width * bpp
  const out = Buffer.alloc(height * stride)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    for (let x = 0; x < stride; x++) {
      const v = raw[y * (stride + 1) + 1 + x]
      const a = x >= bpp ? out[y * stride + x - bpp] : 0
      const b = y > 0 ? out[(y - 1) * stride + x] : 0
      const c = x >= bpp && y > 0 ? out[(y - 1) * stride + x - bpp] : 0
      let r = v
      if (filter === 1) r = v + a
      else if (filter === 2) r = v + b
      else if (filter === 3) r = v + ((a + b) >> 1)
      else if (filter === 4) { const p = a + b - c; const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); r = v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c) }
      out[y * stride + x] = r & 0xff
    }
  }
  return { width, height, pixel: (x, y) => { const i = y * stride + x * bpp; return [out[i], out[i + 1], out[i + 2]] } }
}

describe.skipIf(!VICE || process.env['IMAGINE_SKIP_ROM'])('assembled programs on a real C64 ROM', () => {
  it('LOADs and RUNs the assembled file and the code does what it says', async () => {
    const source = `.basic
        lda #2          ; red border
        sta $d020
        ldx #0
copy:   lda msg,x       ; write "HI" with screen codes to the top-left of the screen
        sta $0400+40,x
        inx
        cpx #2
        bne copy
        jmp *           ; stay here
msg:    .scr "hi"`
    const asm = assemble(source)
    expect(asm.errors).toEqual([])

    const d64 = getPlugin('d64')
    let disk = await d64.format({ label: 'ROMTEST', id: 'RT' })
    disk = await d64.writeFile(disk, { name: 'OTHER', data: Buffer.from([1, 8, 0, 0]) }, { name: 'OTHER', type: 'PRG' })
    disk = await d64.writeFile(disk, { name: 'PROG', data: Buffer.from(asm.prg!) }, { name: 'PROG', type: 'PRG' })

    const dir = await mkdtemp(join(tmpdir(), 'imagine-rom-'))
    try {
      const image = join(dir, 'rom.d64')
      const shot = join(dir, 'screen.png')
      await writeFile(image, disk)
      // the same target string the app uses for "save and run": image:name, so VICE must pick PROG, not the first file
      const r = spawnSync(VICE!, ['-warp', '-sounddev', 'dummy', '-limitcycles', '60000000', '-exitscreenshot', shot, '-autostart', autostartTarget(image, 'PROG')], { timeout: 90_000, cwd: dir })
      expect(existsSync(shot), `VICE exit status ${r.status}`).toBe(true)
      const png = await decodePng(await readFile(shot))
      if (SHOT_DIR) await writeFile(join(SHOT_DIR, 'rom-asm.png'), await readFile(shot))

      // border: any pixel in the top-left corner of the frame is border colour (red in VICE's palette is clearly red)
      const [r0, g0, b0] = png.pixel(4, 4)
      expect(r0, `border colour ${r0},${g0},${b0}`).toBeGreaterThan(g0 + 40)
      expect(r0).toBeGreaterThan(b0 + 40)

      // "HI" in row 1, columns 0 and 1: both cells must contain "ink" pixels (pixels that differ from the screen
      // background). Row 0 above is blank on the C64 start screen, so it must stay empty.
      const bg = png.pixel(32 + 100, 35 + 100)
      const hasInk = (col: number, row: number) => {
        for (let y = 35 + row * 8; y < 35 + row * 8 + 8; y++) for (let x = 32 + col * 8; x < 32 + col * 8 + 8; x++) {
          const p = png.pixel(x, y)
          if (Math.abs(p[0] - bg[0]) + Math.abs(p[1] - bg[1]) + Math.abs(p[2] - bg[2]) > 60) return true
        }
        return false
      }
      expect(hasInk(0, 1)).toBe(true)
      expect(hasInk(1, 1)).toBe(true)
      expect(hasInk(0, 0)).toBe(false)
      expect(hasInk(1, 0)).toBe(false)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  }, 120_000)
})
