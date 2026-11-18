# Imagine

**Disk Image Engine for retro systems** — a cross-platform desktop application to create, inspect, and manipulate disk images for classic home computers and game consoles.

Supported formats: **Commodore** (`.d64`, `.d71`, `.d81` for C64, VIC-20, Plus/4 and C128), **Amiga** (`.adf`), **Atari ST** (`.st`, `.msa`), **DOS** (`.img` FAT12) and ISO 9660 optical disc images. MSX and Amstrad CPC (`.dsk`) are planned.

---

## Features

- Open and inspect disk images in a structured file browser
- Read and write individual files to/from disk images
- Create new, pre-formatted disk images via a guided wizard
- Integrated hex viewer and a built-in editor (CodeMirror 6) for programming directly on the disk:
  - **CBM BASIC** V2 (C64/VIC-20), 3.5 (Plus/4) and 7.0 (C128). Programs are shown as text and saved back as real tokenized PRG files
  - **6502 assembler** with a fixed, documented syntax; assembles to a PRG on the disk and can run it in VICE
  - **Plain text** for any file on any disk (every byte survives a round trip)
  - Files that cannot be edited safely (for example BASIC followed by machine code) open read-only
- Launch bundled emulators directly from the disk view (VICE, Hatari, UAE)
- Cloud sync via Google Drive, Dropbox, OneDrive, Nextcloud (WebDAV) and S3
- Fully localised UI (English / German), easily extensible via i18next
- Plugin architecture — new disk formats can be added without touching the core engine

---

## Technology Stack

| Layer | Technology |
|---|---|
| Shell | Electron 28 (Win / Linux / macOS) |
| UI | React 18 + TypeScript |
| Styling | CSS Modules + Design Token System (`--im-*`) |
| State | Zustand |
| Editor | CodeMirror 6 |
| i18n | i18next + react-i18next |
| Build | electron-vite + electron-builder |
| Tests | Vitest (unit) + Playwright (E2E) |

---

## Prerequisites

- **Node.js** 20 LTS or later
- **npm** 10 or later
- Platform-specific native tools for disk format support:
  - `c1541` / `cbmconvert` — C64 image manipulation
  - `mtools` — FAT12 / DOS images
  - `xorriso` — ISO 9660 creation
  - VICE, Hatari, FS-UAE — optional emulator integration

---

## Getting Started

```bash
# Clone the repository
git clone https://github.com/it-dennis/imagine_app.git
cd imagine_app

# Install dependencies
npm install

# Start in development mode
npm run dev
```

### Production Build

```bash
# Build and package for the current platform
npm run package
```

Distributable artifacts land in `dist/`. Supported targets:

| Platform | Format |
|---|---|
| macOS | `.dmg` |
| Windows | NSIS installer + portable `.exe` |
| Linux | `.AppImage` + `.deb` |

---

## Programming on the disk

Double-click a file in the file list to open it in the matching editor, or use **File → New file…**.

| Shortcut | Action |
|---|---|
| Ctrl+S | Save the open file back into the disk image |
| F5 | Save and run (BASIC), or assemble and run (assembler) in VICE |
| F7 | Assemble |
| Ctrl+Shift+N | New file |

**BASIC text format.** One line per BASIC line (`10 PRINT "HI"`). Bytes without a plain text form use `{name}` or `{$xx}`
(`{clr}`, `{down}`, `{rvon}`, `{$93}` ...; the names match VICE's `petcat`). Keywords are recognised exactly like the
machine does, so `TOTAL` becomes `TO` + `TAL`. The dialect follows the program's start address and can be changed per file.

**Assembler syntax** (anything else is reported as an error with its line number):

```
        .basic                 ; BASIC start line:  10 SYS <address of the code>
        * = $0801              ; or .org $0801   (default start: $0801, $1001 for VIC-20/Plus/4, $1C01 for C128)
SCREEN  = $0400                ; constants
start:  lda #<msg              ; labels with or without colon; @local labels belong to the last global label
        sta SCREEN,x           ; implied, A, #imm, zp/abs, ,x ,y  (zp,x)  (zp),y  (abs) for JMP
        bne start
        .byte 1, $ff, "text"   ; .byte/.word/.fill/.text/.pet/.scr  (the !byte form works too)
msg:    .scr "hello"
```

Expressions: decimal, `$hex`, `%binary`, `0xhex`, `'c'`, labels, `*` (current address), `+ - * / % & | ^ << >>`, unary
`- ~ < >`. Not supported: macros, includes, conditional assembly, anonymous labels, undocumented opcodes.
A forward reference is always assembled as absolute (3 bytes) so addresses stay stable between the two passes.

**Safety.** Saving identifies the file by its directory entry (not just its name), writes the image through a temporary
file, refuses when the file changed on the disk since it was opened (for example by an emulator) and never overwrites
unsaved work without asking.

---

## Project Structure

```
imagine/
├─ src/
│  ├─ main/          # Electron main process (IPC handlers, services, disk engine)
│  ├─ preload/       # Context bridge — exposes typed window.imagineAPI
│  ├─ renderer/      # React UI (screens, components, state, i18n, theme)
│  └─ shared/        # IPC channel constants and shared TypeScript types
├─ design-system/    # Design tokens, component styles, icon library, i18n strings
├─ handoff/          # Architecture docs, component specs, sprint plan
├─ resources/        # App icons, bundled binaries, sample disk images
└─ tests/            # Unit and E2E test suites + fixtures
```

For a detailed breakdown of the architecture and IPC patterns see [`handoff/02-architecture.md`](handoff/02-architecture.md).

---

## Disk Format Plugin API

New disk formats are implemented as plugins against a stable interface:

```ts
interface DiskFormatPlugin {
  id: string;
  systems: System[];
  capabilities: { read: boolean; write: boolean; format: boolean };
  parse(buffer: Buffer): Promise<DiskInfo>;
  listFiles(buffer: Buffer): Promise<DiskFile[]>;
  writeFile(buffer: Buffer, file: SourceFile, target: WriteTarget): Promise<Buffer>;
  deleteFile(buffer: Buffer, fileName: string): Promise<Buffer>;
  format(opts: FormatOpts): Promise<Buffer>;
}
```

Register a plugin in `src/main/services/disk-engine/index.ts`. The core engine routes all operations through this interface — no core changes required to add a new system.

---

## Tests

```bash
npm test            # unit and oracle tests (fast)
npm run test:e2e    # builds the app and drives it with Playwright
```

Several tests use **VICE's own tools as independent references** and are skipped when VICE is not installed
(set `IMAGINE_VICE_DIR` if it is in an unusual place): `c1541` judges the D64/D71/D81 images (byte-identical blank
disks, `validate` must not change our images), `petcat` judges the BASIC tokenizer, and one test runs an assembled
program on a real C64 ROM in VICE. The results that matter are also checked in as fixtures under `tests/fixtures`.
The BASIC token tables are generated from `petcat` (`node scripts/gen-basic-tokens.mjs`).

---

## Contributing & Collaboration

Contributions and collaboration are very welcome — whether code, new disk format plugins, translations, test images, documentation or ideas.

1. Open an issue first for larger changes or new features, so we can align on the approach.
2. Fork the repository and create a feature branch.
3. Follow the existing code style (ESLint + Prettier + TypeScript strict mode).
4. Add or update tests for any changed behaviour.
5. Open a pull request with a clear description of the change.

By submitting a contribution you agree that it is licensed under the same terms as the project, the **GNU GPL v3 or later** (see [License](#license)).

Bug reports and feature requests are welcome via the [issue tracker](https://github.com/it-dennis/imagine_app/issues).

---

## Contact

**Dennis Rapp**

- E-mail: [info@dennisrapp.com](mailto:info@dennisrapp.com)
- GitHub: [@it-dennis](https://github.com/it-dennis)

For collaboration requests, questions or feedback feel free to get in touch by e-mail or open an issue.

---

## License

Imagine is free software, licensed under the **GNU General Public License v3.0 or later** (`GPL-3.0-or-later`). The full license text is in the [`LICENSE`](LICENSE) file.

Copyright (C) 2026 Dennis Rapp

This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.

This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.

You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
