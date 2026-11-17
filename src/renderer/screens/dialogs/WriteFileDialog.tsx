import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useUIStore } from '../../state/ui.store'
import { useWorkspaceStore } from '../../state/workspace.store'
import { Save, Close, FolderOpen } from '../../components/icons'
import type { DiskFile, DiskFormat } from '../../../shared/types'

const CBM_FORMATS: DiskFormat[] = ['d64', 'd71', 'd81']
const CBM_FILE_TYPES: DiskFile['type'][] = ['PRG', 'SEQ', 'USR', 'REL']

export const WriteFileDialog: React.FC = () => {
  const { t } = useTranslation()
  const closeDialog = useUIStore((s) => s.closeDialog)
  const addToast = useUIStore((s) => s.addToast)
  const { disks, activeDiskId, updateDisk } = useWorkspaceStore()
  const disk = disks.find((d) => d.id === activeDiskId) ?? null
  const isCbm = disk ? CBM_FORMATS.includes(disk.format) : true

  const [source, setSource] = useState('')
  const [saveAs, setSaveAs] = useState('')
  const [fileType, setFileType] = useState<DiskFile['type']>('PRG')
  const [busy, setBusy] = useState(false)

  const pickSource = async () => {
    try {
      const picked = await window.imagineAPI.fs.pickFile()
      if (typeof picked === 'string') {
        setSource(picked)
        if (!saveAs) setSaveAs(picked.split(/[\\/]/).pop()?.split('.')[0]?.toUpperCase() ?? '')
      }
    } catch {
      addToast({ intent: 'info', title: t('toastErrorTitle'), description: 'Datei-Dialog ist noch nicht angebunden (Main-Prozess IPC fehlt).' })
    }
  }

  const write = async () => {
    if (!disk || disk.writeProtected) {
      addToast({ intent: 'danger', title: t('toastErrorTitle'), description: t('toastErrorWrite') })
      return
    }
    if (!source || !saveAs.trim()) return
    setBusy(true)
    try {
      const updated = await window.imagineAPI.disk.write(disk.id, source, { name: saveAs.trim(), type: isCbm ? fileType : 'FILE' })
      updateDisk(updated)
      addToast({ intent: 'success', title: t('toastWriteOk'), description: saveAs.trim().toUpperCase() })
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
        <span className="im-dialog-icon"><Save size={18} /></span>
        <span className="im-dialog-title" style={{ flex: 1 }}>{t('writeTitle')}</span>
        <button className="im-btn im-btn--icon im-btn--ghost" onClick={closeDialog}><Close size={16} /></button>
      </div>

      <div className="im-dialog-body">
        <div className="im-field">
          <label className="im-label">{t('writeSource')}</label>
          <div className="im-flex im-gap-2">
            <input className="im-input" value={source} onChange={(e) => setSource(e.target.value)} placeholder="…" />
            <button className="im-btn" onClick={pickSource}><FolderOpen size={16} /></button>
          </div>
        </div>

        <div className="im-field">
          <label className="im-label">{t('writeDestination')}</label>
          <input className="im-input" value={disk ? `${disk.name}.${disk.format.toUpperCase()}` : '—'} disabled />
        </div>

        <div className="im-flex im-gap-3">
          <div className="im-field" style={{ flex: 1 }}>
            <label className="im-label">{t('writeAs')}</label>
            <input className="im-input" maxLength={isCbm ? 16 : 64} value={saveAs} onChange={(e) => setSaveAs(e.target.value)} />
          </div>
          {isCbm && (
            <div className="im-field" style={{ width: 120 }}>
              <label className="im-label">{t('writeFileType')}</label>
              <select className="im-select" value={fileType} onChange={(e) => setFileType(e.target.value as DiskFile['type'])}>
                {CBM_FILE_TYPES.map((ft) => <option key={ft} value={ft}>{ft}</option>)}
              </select>
            </div>
          )}
        </div>

        {busy && (
          <div className="im-field">
            <label className="im-label">{t('writeProgress')}</label>
            <div className="im-progress">
              <div className="im-progress-bar im-splash-bar" />
            </div>
          </div>
        )}
      </div>

      <div className="im-dialog-footer">
        <button className="im-btn im-btn--ghost" onClick={closeDialog}>{t('btnCancel')}</button>
        <button className="im-btn im-btn--primary" disabled={!disk || !source || !saveAs.trim() || busy} onClick={write}>
          <Save size={16} />{busy ? t('statLoading') : t('btnSave')}
        </button>
      </div>
    </div>
  )
}
