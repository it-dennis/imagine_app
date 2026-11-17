import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useUIStore } from '../../state/ui.store'
import { useWorkspaceStore } from '../../state/workspace.store'
import { FolderOpen, HardDrive, Cloud, Search, Close } from '../../components/icons'

const DISK_EXTENSIONS = ['.d64', '.d71', '.d81', '.adf', '.st', '.msa', '.img', '.dsk', '.iso']

export const FileBrowserDialog: React.FC = () => {
  const { t } = useTranslation()
  const closeDialog = useUIStore((s) => s.closeDialog)
  const addToast = useUIStore((s) => s.addToast)
  const { disks, setActiveDisk, addDisk } = useWorkspaceStore()
  const [query, setQuery] = useState('')
  const [location, setLocation] = useState<'recent' | 'mac' | 'cloud'>('recent')

  const filtered = disks.filter((d) => d.name.toLowerCase().includes(query.toLowerCase()))

  const openFromSystem = async () => {
    try {
      const picked = await window.imagineAPI.fs.pickFile(DISK_EXTENSIONS)
      if (!picked) return
      const disk = await window.imagineAPI.disk.open(picked)
      addDisk(disk)
      addToast({ intent: 'success', title: t('toastDiskCreated'), description: disk.name })
      closeDialog()
    } catch (err) {
      addToast({ intent: 'danger', title: t('toastErrorTitle'), description: err instanceof Error ? err.message : String(err) })
    }
  }

  return (
    <div className="im-dialog" style={{ minWidth: 640, maxWidth: 720 }}>
      <div className="im-dialog-header">
        <span className="im-dialog-icon"><FolderOpen size={18} /></span>
        <span className="im-dialog-title" style={{ flex: 1 }}>{t('fbTitle')}</span>
        <button className="im-btn im-btn--icon im-btn--ghost" onClick={closeDialog}><Close size={16} /></button>
      </div>

      <div className="im-flex" style={{ minHeight: 320 }}>
        <div style={{ width: 180, borderRight: '1px solid var(--im-line-soft)', padding: 'var(--im-s-3)' }}>
          <div className="im-uppercase im-text-3" style={{ marginBottom: 'var(--im-s-2)' }}>{t('fbLocations')}</div>
          <ul className="im-list" style={{ padding: 0, overflow: 'visible' }}>
            <li className={`im-list-item${location === 'recent' ? ' active' : ''}`} onClick={() => setLocation('recent')}>
              <HardDrive size={16} />{t('fbRecent')}
            </li>
            <li className={`im-list-item${location === 'mac' ? ' active' : ''}`} onClick={() => setLocation('mac')}>
              <HardDrive size={16} />{t('fbThisMac')}
            </li>
            <li className={`im-list-item${location === 'cloud' ? ' active' : ''}`} onClick={() => setLocation('cloud')}>
              <Cloud size={16} />{t('fbCloud')}
            </li>
          </ul>
        </div>

        <div className="im-flex-col im-grow" style={{ minWidth: 0 }}>
          <div style={{ padding: 'var(--im-s-3)' }}>
            {location === 'recent' ? (
              <input className="im-input" placeholder={t('fbSearch')} value={query} onChange={(e) => setQuery(e.target.value)} />
            ) : (
              <button className="im-btn im-btn--primary" onClick={openFromSystem} style={{ width: '100%' }}>
                <Search size={16} />{t('fbSearch')}
              </button>
            )}
          </div>

          {location === 'recent' ? (
            <table className="im-table">
              <thead>
                <tr>
                  <th>{t('fbName')}</th>
                  <th>{t('fbType')}</th>
                  <th>{t('fbSize')}</th>
                  <th>{t('fbModified')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((d) => (
                  <tr key={d.id} onDoubleClick={() => { setActiveDisk(d.id); closeDialog() }}>
                    <td>{d.name}.{d.format}</td>
                    <td>{d.system.toUpperCase()}</td>
                    <td>{(d.capacityBytes / 1024).toFixed(0)} KB</td>
                    <td>{d.createdAt}</td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={4} className="im-text-3" style={{ padding: 'var(--im-s-5)', textAlign: 'center' }}>{t('sbEmpty')}</td></tr>
                )}
              </tbody>
            </table>
          ) : (
            <div className="im-center im-text-3 im-grow" style={{ fontSize: 'var(--im-fs-sm)' }}>
              {t('fbSearch')} → {DISK_EXTENSIONS.join(', ')}
            </div>
          )}
        </div>
      </div>

      <div className="im-dialog-footer">
        <button className="im-btn im-btn--ghost" onClick={closeDialog}>{t('btnCancel')}</button>
      </div>
    </div>
  )
}
