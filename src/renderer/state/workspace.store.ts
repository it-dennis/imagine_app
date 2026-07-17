import { create } from 'zustand'
import type { VirtualDisk, DiskFile } from '../../shared/types'

const MOCK_FILES: DiskFile[] = [
  { name: 'MAIN',    type: 'PRG', sizeBytes: 12288, blocks: 48 },
  { name: 'INTRO',   type: 'PRG', sizeBytes: 4096,  blocks: 16 },
  { name: 'SPRITES', type: 'SEQ', sizeBytes: 2048,  blocks: 8  },
  { name: 'MUSIC',   type: 'PRG', sizeBytes: 6144,  blocks: 24 },
  { name: 'LEVEL1',  type: 'SEQ', sizeBytes: 3072,  blocks: 12 },
  { name: 'LEVEL2',  type: 'SEQ', sizeBytes: 3072,  blocks: 12 },
  { name: 'CHARSET', type: 'USR', sizeBytes: 2048,  blocks: 8  },
  { name: 'README',  type: 'SEQ', sizeBytes: 1024,  blocks: 4  },
]

const MOCK_DISKS: VirtualDisk[] = [
  {
    id: '1',
    name: 'C64-DEV-HELPER',
    system: 'c64',
    format: 'd64',
    path: '~/Documents/Imagine/c64-dev-helper.d64',
    capacityBytes: 174080,
    freeBytes: 133120,
    files: MOCK_FILES,
    writeProtected: false,
    modified: false,
    createdAt: '2026-04-27',
  },
  {
    id: '2',
    name: 'GAME-SOURCES',
    system: 'c64',
    format: 'd64',
    path: '~/Documents/Imagine/game-sources.d64',
    capacityBytes: 174080,
    freeBytes: 90112,
    files: [],
    writeProtected: false,
    modified: false,
    createdAt: '2026-04-25',
  },
  {
    id: '3',
    name: 'AMIGA-DEMO',
    system: 'amiga',
    format: 'adf',
    path: '~/Documents/Imagine/amiga-demo.adf',
    capacityBytes: 901120,
    freeBytes: 450560,
    files: [],
    writeProtected: false,
    modified: false,
    createdAt: '2026-04-20',
  },
]

interface WorkspaceState {
  disks: VirtualDisk[]
  activeDiskId: string | null
  setActiveDisk: (id: string | null) => void
  addDisk: (disk: VirtualDisk) => void
  removeDisk: (id: string) => void
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  disks: MOCK_DISKS,
  activeDiskId: '1',
  setActiveDisk: (id) => set({ activeDiskId: id }),
  addDisk: (disk) => set((s) => ({ disks: [...s.disks, disk], activeDiskId: disk.id })),
  removeDisk: (id) => set((s) => ({
    disks: s.disks.filter((d) => d.id !== id),
    activeDiskId: s.activeDiskId === id ? null : s.activeDiskId,
  })),
}))
