import { create } from 'zustand'
import type { VirtualDisk } from '../../shared/types'

interface WorkspaceState {
  disks: VirtualDisk[]
  activeDiskId: string | null
  setActiveDisk: (id: string | null) => void
  addDisk: (disk: VirtualDisk) => void
  updateDisk: (disk: VirtualDisk) => void
  removeDisk: (id: string) => void
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  disks: [],
  activeDiskId: null,
  setActiveDisk: (id) => set({ activeDiskId: id }),
  addDisk: (disk) => set((s) => ({ disks: [...s.disks, disk], activeDiskId: disk.id })),
  updateDisk: (disk) => set((s) => ({ disks: s.disks.map((d) => (d.id === disk.id ? disk : d)) })),
  removeDisk: (id) => set((s) => ({
    disks: s.disks.filter((d) => d.id !== id),
    activeDiskId: s.activeDiskId === id ? null : s.activeDiskId,
  })),
}))
