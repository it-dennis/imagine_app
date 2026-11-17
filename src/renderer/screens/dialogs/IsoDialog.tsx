import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useUIStore } from '../../state/ui.store'
import { Disc, Close, Folder } from '../../components/icons'

export const IsoDialog: React.FC = () => {
  const { t } = useTranslation()
  const closeDialog = useUIStore((s) => s.closeDialog)
  const addToast = useUIStore((s) => s.addToast)

  const [source, setSource] = useState('')
  const [label, setLabel] = useState('')
  const [outputFolder, setOutputFolder] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    window.imagineAPI.fs.defaultFolder().then((f) => setOutputFolder((cur) => cur || f)).catch(() => {})
  }, [])

  const pick = async (setter: (v: string) => void) => {
    try {
      const picked = await window.imagineAPI.fs.pickFolder()
      if (typeof picked === 'string') setter(picked)
    } catch {
      addToast({ intent: 'info', title: t('toastErrorTitle'), description: 'Ordner-Dialog ist nicht verfügbar.' })
    }
  }

  const create = async () => {
    if (!source || !outputFolder) return
    setBusy(true)
    try {
      const fileName = `${(label.trim() || 'untitled').toLowerCase().replace(/[^a-z0-9_-]/g, '_')}.iso`
      const output = `${outputFolder.replace(/[\\/]+$/, '')}/${fileName}`
      const result = await window.imagineAPI.iso.create({ source, label: label.trim() || 'UNTITLED', output })
      addToast({ intent: 'success', title: t('btnCreate'), description: `${fileName} (${(result.sizeBytes / 1024).toFixed(0)} KB)` })
      closeDialog()
    } catch (err) {
      addToast({ intent: 'danger', title: t('toastErrorTitle'), description: err instanceof Error ? err.message : String(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="im-dialog" style={{ minWidth: 480 }}>
      <div className="im-dialog-header">
        <span className="im-dialog-icon"><Disc size={18} /></span>
        <span className="im-dialog-title" style={{ flex: 1 }}>{t('isoTitle')}</span>
        <button className="im-btn im-btn--icon im-btn--ghost" onClick={closeDialog}><Close size={16} /></button>
      </div>

      <div className="im-dialog-body">
        <div className="im-field">
          <label className="im-label">{t('isoSource')}</label>
          <div className="im-flex im-gap-2">
            <input className="im-input" value={source} onChange={(e) => setSource(e.target.value)} />
            <button className="im-btn" onClick={() => pick(setSource)}><Folder size={16} /></button>
          </div>
        </div>

        <div className="im-field">
          <label className="im-label">{t('isoLabel')}</label>
          <input className="im-input" maxLength={32} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="UNTITLED" />
        </div>

        <div className="im-field">
          <label className="im-label">{t('isoOutput')}</label>
          <div className="im-flex im-gap-2">
            <input className="im-input" value={outputFolder} onChange={(e) => setOutputFolder(e.target.value)}  />
            <button className="im-btn" onClick={() => pick(setOutputFolder)}><Folder size={16} /></button>
          </div>
        </div>

        <p className="im-text-3" style={{ margin: 0, fontSize: 'var(--im-fs-xs)' }}>
          ISO 9660 Level 1, ohne Joliet/Rock-Ridge-Erweiterungen und nicht bootfähig.
        </p>
      </div>

      <div className="im-dialog-footer">
        <button className="im-btn im-btn--ghost" onClick={closeDialog}>{t('btnCancel')}</button>
        <button className="im-btn im-btn--primary" disabled={!source || !outputFolder || busy} onClick={create}>
          <Disc size={16} />{busy ? t('statLoading') : t('btnCreate')}
        </button>
      </div>
    </div>
  )
}
