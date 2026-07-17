import { create } from 'zustand'
import type { ActiveTab, DialogId, Toast } from '../../shared/types'

interface UIState {
  activeTab: ActiveTab
  sidebarVisible: boolean
  activeDialog: DialogId | null
  toasts: Toast[]
  setActiveTab: (tab: ActiveTab) => void
  toggleSidebar: () => void
  openDialog: (id: DialogId) => void
  closeDialog: () => void
  addToast: (toast: Omit<Toast, 'id'>) => void
  removeToast: (id: string) => void
}

export const useUIStore = create<UIState>((set) => ({
  activeTab: 'files',
  sidebarVisible: true,
  activeDialog: null,
  toasts: [],
  setActiveTab: (tab) => set({ activeTab: tab }),
  toggleSidebar: () => set((s) => ({ sidebarVisible: !s.sidebarVisible })),
  openDialog: (id) => set({ activeDialog: id }),
  closeDialog: () => set({ activeDialog: null }),
  addToast: (toast) => {
    const id = Math.random().toString(36).slice(2)
    set((s) => ({ toasts: [...s.toasts, { ...toast, id }] }))
    const duration = toast.duration ?? 5000
    if (duration > 0) setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), duration)
  },
  removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))
