# Imagine

**Disk Image Engine for retro systems** — a cross-platform desktop application to create, inspect, and manipulate disk images for classic home computers and game consoles.

Supported formats include **C64** (`.d64`, `.d71`, `.d81`), **Amiga** (`.adf`), **Atari ST** (`.st`, `.msa`), **DOS** (`.img` FAT12), **MSX** and **Amstrad CPC** (`.dsk`) as well as ISO 9660 optical disc images.

---

## Features

- Open and inspect disk images in a structured file browser
- Read and write individual files to/from disk images
- Create new, pre-formatted disk images via a guided wizard
- Integrated hex viewer and Monaco-based code/text editor
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
| Editor | Monaco Editor |
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
git clone https://github.com/dennisrapp/imagine.git
cd imagine

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

## Contributing

1. Fork the repository and create a feature branch.
2. Follow the existing code style (ESLint + Prettier + TypeScript strict mode).
3. Add or update tests for any changed behaviour.
4. Open a pull request with a clear description of the change.

Bug reports and feature requests are welcome via the issue tracker.

---

## License

Copyright (C) 2026 Dennis Rapp

This program is free software: you can redistribute it and/or modify it under the terms of the **GNU General Public License** as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.

This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.

You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
