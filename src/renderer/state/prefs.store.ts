import { create } from 'zustand'
import type { Theme, Accent, Font, Language } from '../../shared/types'

interface PersistedPrefs {
  theme: Theme
  accent: Accent
  font: Font
  language: Language
  vicePath: string
  hatariPath: string
}

interface PrefsState extends PersistedPrefs {
  setTheme: (t: Theme) => void
  setAccent: (a: Accent) => void
  setFont: (f: Font) => void
  setLanguage: (l: Language) => void
  setVicePath: (p: string) => void
  setHatariPath: (p: string) => void
  hydrate: () => Promise<void>
  /** Searches for installed emulators; fills empty paths, or replaces existing ones with `overwrite`. */
  autodetect: (overwrite?: boolean) => Promise<{ vicePath?: string; hatariPath?: string }>
}

const KEYS: (keyof PersistedPrefs)[] = ['theme', 'accent', 'font', 'language', 'vicePath', 'hatariPath']

const DEFAULTS: PersistedPrefs = {
  theme: 'dark',
  accent: 'phosphor',
  font: 'modern',
  language: 'de',
  vicePath: '',
  hatariPath: '',
}

// localStorage is only a synchronous first-paint cache; prefs.json in userData (via IPC) is the source of truth.
const load = <T>(key: string, def: T): T => {
  try { return JSON.parse(localStorage.getItem(key) ?? 'null') ?? def } catch { return def }
}
const cache = (key: string, val: unknown) => { try { localStorage.setItem(key, JSON.stringify(val)) } catch {} }

const persist = <K extends keyof PersistedPrefs>(key: K, val: PersistedPrefs[K]) => {
  cache(`im.${key}`, val)
  window.imagineAPI?.prefs.set({ [key]: val }).catch(() => {})
}

export const usePrefsStore = create<PrefsState>((set, get) => ({
  theme:    load('im.theme',    DEFAULTS.theme),
  accent:   load('im.accent',   DEFAULTS.accent),
  font:     load('im.font',     DEFAULTS.font),
  language: load('im.language', DEFAULTS.language),
  vicePath: load('im.vicePath', DEFAULTS.vicePath),
  hatariPath: load('im.hatariPath', DEFAULTS.hatariPath),
  setTheme:    (theme)    => { persist('theme', theme);       set({ theme }) },
  setAccent:   (accent)   => { persist('accent', accent);     set({ accent }) },
  setFont:     (font)     => { persist('font', font);         set({ font }) },
  setLanguage: (language) => { persist('language', language); set({ language }) },
  setVicePath: (vicePath) => { persist('vicePath', vicePath); set({ vicePath }) },
  setHatariPath: (hatariPath) => { persist('hatariPath', hatariPath); set({ hatariPath }) },

  autodetect: async (overwrite = false) => {
    try {
      const found = await window.imagineAPI.emulator.detect()
      const { vicePath, hatariPath, setVicePath, setHatariPath } = get()
      if (found.vicePath && (overwrite || !vicePath)) setVicePath(found.vicePath)
      if (found.hatariPath && (overwrite || !hatariPath)) setHatariPath(found.hatariPath)
      return found
    } catch {
      return {}
    }
  },

  hydrate: async () => {
    try {
      const stored = await window.imagineAPI.prefs.get()
      const known = KEYS.filter((k) => stored[k] !== undefined)
      if (known.length === 0) {
        // First run with the unified store: migrate whatever localStorage held into prefs.json.
        const current = get()
        await window.imagineAPI.prefs.set(Object.fromEntries(KEYS.map((k) => [k, current[k]])))
        return
      }
      const patch = Object.fromEntries(known.map((k) => [k, stored[k]])) as Partial<PersistedPrefs>
      for (const k of known) cache(`im.${k}`, stored[k])
      set(patch)
    } catch {
      // IPC unavailable (e.g. plain browser dev): keep localStorage values.
    }
  },
}))
