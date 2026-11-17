import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useUIStore } from '../state/ui.store'
import { usePrefsStore } from '../state/prefs.store'
import { Settings, Close, Cpu, HardDrive, Cloud, Eye, Terminal, Code, Folder } from '../components/icons'
import type { Theme, Accent, Font, Language } from '../../shared/types'

type Category = 'general' | 'emulator' | 'storage' | 'cloud' | 'appearance' | 'shortcuts' | 'advanced'

const CATEGORIES: { id: Category; labelKey: string; Icon: React.FC<{ size?: number }> }[] = [
  { id: 'general',    labelKey: 'setGeneral',    Icon: Settings },
  { id: 'appearance', labelKey: 'setAppearance', Icon: Eye },
  { id: 'emulator',   labelKey: 'setEmulator',   Icon: Terminal },
  { id: 'storage',    labelKey: 'setStorage',    Icon: HardDrive },
  { id: 'cloud',      labelKey: 'setCloud',      Icon: Cloud },
  { id: 'shortcuts',  labelKey: 'setShortcuts',  Icon: Code },
  { id: 'advanced',   labelKey: 'setAdvanced',   Icon: Cpu },
]

export const SettingsScreen: React.FC = () => {
  const { t, i18n } = useTranslation()
  const closeDialog = useUIStore((s) => s.closeDialog)
  const { theme, accent, font, language, vicePath, hatariPath, setTheme, setAccent, setFont, setLanguage, setVicePath, setHatariPath } = usePrefsStore()
  const [category, setCategory] = useState<Category>('general')

  const changeLanguage = (l: Language) => {
    setLanguage(l)
    i18n.changeLanguage(l)
  }

  const pickPath = async (apply: (p: string) => void) => {
    try {
      const picked = await window.imagineAPI.fs.pickFile()
      if (typeof picked === 'string') apply(picked)
    } catch {
      /* IPC not wired up yet */
    }
  }

  return (
    <div className="im-dialog" style={{ minWidth: 640, maxWidth: 760 }}>
      <div className="im-dialog-header">
        <span className="im-dialog-icon"><Settings size={18} /></span>
        <span className="im-dialog-title" style={{ flex: 1 }}>{t('miPreferences')}</span>
        <button className="im-btn im-btn--icon im-btn--ghost" onClick={closeDialog}><Close size={16} /></button>
      </div>

      <div className="im-flex" style={{ minHeight: 380 }}>
        <div style={{ width: 180, borderRight: '1px solid var(--im-line-soft)', padding: 'var(--im-s-2)' }}>
          <ul className="im-list" style={{ padding: 0, overflow: 'visible' }}>
            {CATEGORIES.map(({ id, labelKey, Icon }) => (
              <li key={id} className={`im-list-item${category === id ? ' active' : ''}`} onClick={() => setCategory(id)}>
                <Icon size={16} />{t(labelKey)}
              </li>
            ))}
          </ul>
        </div>

        <div className="im-dialog-body im-grow" style={{ padding: 'var(--im-s-5)' }}>
          {category === 'general' && (
            <div className="im-field">
              <label className="im-label">{t('setLanguage')}</label>
              <select className="im-select" value={language} onChange={(e) => changeLanguage(e.target.value as Language)}>
                <option value="de">Deutsch</option>
                <option value="en">English</option>
              </select>
            </div>
          )}

          {category === 'appearance' && (
            <div className="im-flex-col im-gap-4">
              <div className="im-field">
                <label className="im-label">{t('setTheme')}</label>
                <select className="im-select" value={theme} onChange={(e) => setTheme(e.target.value as Theme)}>
                  <option value="dark">Dark</option>
                  <option value="light">Light</option>
                  <option value="system">System</option>
                </select>
              </div>
              <div className="im-field">
                <label className="im-label">{t('setAccent')}</label>
                <select className="im-select" value={accent} onChange={(e) => setAccent(e.target.value as Accent)}>
                  <option value="phosphor">Phosphor</option>
                  <option value="amber">Amber</option>
                  <option value="c64">C64</option>
                  <option value="amiga">Amiga</option>
                  <option value="neutral">Neutral</option>
                </select>
              </div>
              <div className="im-field">
                <label className="im-label">{t('setFont')}</label>
                <select className="im-select" value={font} onChange={(e) => setFont(e.target.value as Font)}>
                  <option value="modern">Modern</option>
                  <option value="mono">Mono</option>
                  <option value="pixel">Pixel</option>
                </select>
              </div>
            </div>
          )}

          {category === 'emulator' && (
            <>
              <div className="im-field">
                <label className="im-label">{t('setEmuPath')}</label>
                <div className="im-flex im-gap-2">
                  <input className="im-input" value={vicePath} onChange={(e) => setVicePath(e.target.value)} placeholder="/usr/local/bin/x64sc" />
                  <button className="im-btn" onClick={() => pickPath(setVicePath)}><Folder size={16} /></button>
                </div>
                <div className="im-text-3" style={{ fontSize: 'var(--im-fs-sm)' }}>{t('setEmuViceHint')}</div>
              </div>
              <div className="im-field">
                <label className="im-label">{t('setEmuHatariPath')}</label>
                <div className="im-flex im-gap-2">
                  <input className="im-input" value={hatariPath} onChange={(e) => setHatariPath(e.target.value)} placeholder="/usr/bin/hatari" />
                  <button className="im-btn" onClick={() => pickPath(setHatariPath)}><Folder size={16} /></button>
                </div>
              </div>
            </>
          )}

          {(category === 'storage' || category === 'cloud' || category === 'shortcuts' || category === 'advanced') && (
            <div className="im-center im-text-3 im-grow" style={{ fontSize: 'var(--im-fs-sm)', height: '100%' }}>
              {t(CATEGORIES.find((c) => c.id === category)!.labelKey)} — noch nicht implementiert
            </div>
          )}
        </div>
      </div>

      <div className="im-dialog-footer">
        <button className="im-btn im-btn--primary" onClick={closeDialog}>{t('btnDone')}</button>
      </div>
    </div>
  )
}
