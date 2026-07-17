import { create } from 'zustand'
import type { Theme, Accent, Font, Language } from '../../shared/types'

interface PrefsState {
  theme: Theme
  accent: Accent
  font: Font
  language: Language
  vicePath: string
  setTheme: (t: Theme) => void
  setAccent: (a: Accent) => void
  setFont: (f: Font) => void
  setLanguage: (l: Language) => void
  setVicePath: (p: string) => void
}

const load = <T>(key: string, def: T): T => {
  try { return JSON.parse(localStorage.getItem(key) ?? 'null') ?? def } catch { return def }
}
const save = (key: string, val: unknown) => { try { localStorage.setItem(key, JSON.stringify(val)) } catch {} }

export const usePrefsStore = create<PrefsState>((set) => ({
  theme:    load('im.theme',    'dark' as Theme),
  accent:   load('im.accent',   'phosphor' as Accent),
  font:     load('im.font',     'modern' as Font),
  language: load('im.language', 'de' as Language),
  vicePath: load('im.vicePath', ''),
  setTheme:    (theme)    => { save('im.theme',    theme);    set({ theme }) },
  setAccent:   (accent)   => { save('im.accent',   accent);   set({ accent }) },
  setFont:     (font)     => { save('im.font',     font);     set({ font }) },
  setLanguage: (language) => { save('im.language', language); set({ language }) },
  setVicePath: (vicePath) => { save('im.vicePath', vicePath); set({ vicePath }) },
}))
