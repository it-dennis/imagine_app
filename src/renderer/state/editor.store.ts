import { create } from 'zustand'
import type { EditorDoc } from '../lib/editor-doc'

interface EditorState {
  doc: EditorDoc | null
  /** Why the last save failed, shown above the editor (e.g. the disk changed in an emulator). */
  saveError: string | null
  open: (doc: EditorDoc) => void
  setText: (text: string) => void
  patch: (patch: Partial<EditorDoc>) => void
  setSaveError: (message: string | null) => void
  close: () => void
}

export const useEditorStore = create<EditorState>((set) => ({
  doc: null,
  saveError: null,
  open: (doc) => set({ doc, saveError: null }),
  setText: (text) => set((s) => (s.doc ? { doc: { ...s.doc, text } } : s)),
  patch: (patch) => set((s) => (s.doc ? { doc: { ...s.doc, ...patch } } : s)),
  setSaveError: (saveError) => set({ saveError }),
  close: () => set({ doc: null, saveError: null }),
}))
