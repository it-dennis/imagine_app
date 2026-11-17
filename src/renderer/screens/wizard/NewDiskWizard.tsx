import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useWorkspaceStore } from '../../state/workspace.store'
import { useUIStore } from '../../state/ui.store'
import { FloppyPlus, ArrowLeft, ArrowRight, Close, Folder } from '../../components/icons'
import { Floppy3D } from '../../components/Floppy3D'
import type { System, DiskFormat } from '../../../shared/types'

const SYSTEMS: { id: System; label: string; badge: string }[] = [
  { id: 'c64',     label: 'Commodore 64',   badge: 'im-badge--c64' },
  { id: 'vic20',   label: 'Commodore VIC-20', badge: 'im-badge--c64' },
  { id: 'plus4',   label: 'Commodore Plus/4', badge: 'im-badge--c64' },
  { id: 'amiga',   label: 'Amiga',          badge: 'im-badge--amiga' },
  { id: 'atariST', label: 'Atari ST',       badge: 'im-badge--atari' },
  { id: 'dos',     label: 'DOS (FAT12)',    badge: 'im-badge--dos' },
  { id: 'msx',     label: 'MSX',            badge: 'im-badge--msx' },
  { id: 'cpc',     label: 'Amstrad CPC',    badge: 'im-badge--cpc' },
]

const FORMATS_BY_SYSTEM: Record<System, DiskFormat[]> = {
  c64: ['d64', 'd71', 'd81'],
  vic20: ['d64'],
  plus4: ['d64'],
  amiga: ['adf'],
  atariST: ['st', 'msa'],
  dos: ['img'],
  msx: ['dsk'],
  cpc: ['dsk'],
}

const CAPACITY_BYTES: Record<DiskFormat, number> = {
  d64: 174848,
  d71: 349696,
  d81: 819200,
  adf: 901120,
  st: 737280,
  msa: 737280,
  img: 1474560,
  dsk: 184320,
  iso: 0, // ISO images are created via the dedicated "ISO erstellen…" dialog, not this wizard
}

const STEPS = ['wizStepSystem', 'wizStepFormat', 'wizStepName'] as const

export const NewDiskWizard: React.FC = () => {
  const { t } = useTranslation()
  const closeDialog = useUIStore((s) => s.closeDialog)
  const addToast = useUIStore((s) => s.addToast)
  const addDisk = useWorkspaceStore((s) => s.addDisk)

  const [step, setStep] = useState(0)
  const [system, setSystem] = useState<System>('c64')
  const [format, setFormat] = useState<DiskFormat>('d64')
  const [label, setLabel] = useState('')
  const [folder, setFolder] = useState('~/Documents/Imagine')
  const [busy, setBusy] = useState(false)

  const availableFormats = FORMATS_BY_SYSTEM[system]

  const pickSystem = (id: System) => {
    setSystem(id)
    setFormat(FORMATS_BY_SYSTEM[id][0])
  }

  const pickFolder = async () => {
    try {
      const picked = await window.imagineAPI?.fs.pickFolder()
      if (typeof picked === 'string' && picked) setFolder(picked)
    } catch {
      // IPC not wired up yet — keep the manually entered path
    }
  }

  const canContinue = step === 0 ? !!system : step === 1 ? !!format : label.trim().length > 0

  const finish = async () => {
    setBusy(true)
    try {
      const disk = await window.imagineAPI.disk.create({ system, format, label: label.trim() || 'UNTITLED', folder })
      addDisk(disk)
      addToast({ intent: 'success', title: t('toastDiskCreated'), description: disk.name })
      closeDialog()
    } catch (err) {
      addToast({ intent: 'danger', title: t('toastErrorTitle'), description: err instanceof Error ? err.message : String(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="im-dialog" style={{ minWidth: 520 }}>
      <div className="im-dialog-header">
        <span className="im-dialog-icon"><FloppyPlus size={18} /></span>
        <span className="im-dialog-title" style={{ flex: 1 }}>{t('wizTitle')}</span>
        <button className="im-btn im-btn--icon im-btn--ghost" onClick={closeDialog}><Close size={16} /></button>
      </div>

      <div className="im-tabs" style={{ padding: '0 var(--im-s-5)' }}>
        {STEPS.map((key, i) => (
          <div key={key} className={`im-tab${i === step ? ' active' : ''}`} style={{ cursor: 'default' }}>
            {i + 1}. {t(key)}
          </div>
        ))}
      </div>

      <div className="im-dialog-body">
        {step === 0 && (
          <>
            <p className="im-text-2" style={{ margin: 0, fontSize: 'var(--im-fs-sm)' }}>{t('wizSystemHint')}</p>
            <div className="im-flex im-gap-2" style={{ flexWrap: 'wrap' }}>
              {SYSTEMS.map((s) => (
                <span
                  key={s.id}
                  className={`im-badge ${s.badge}`}
                  style={{
                    cursor: 'pointer',
                    padding: '8px 14px',
                    fontSize: 'var(--im-fs-sm)',
                    textTransform: 'none',
                    border: s.id === system ? '1px solid var(--im-accent)' : undefined,
                  }}
                  onClick={() => pickSystem(s.id)}
                >
                  {s.label}
                </span>
              ))}
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <p className="im-text-2" style={{ margin: 0, fontSize: 'var(--im-fs-sm)' }}>{t('wizFormatHint')}</p>
            <div className="im-flex im-gap-2">
              {availableFormats.map((f) => (
                <span
                  key={f}
                  className="im-badge"
                  style={{
                    cursor: 'pointer',
                    padding: '8px 14px',
                    fontSize: 'var(--im-fs-sm)',
                    textTransform: 'uppercase',
                    border: f === format ? '1px solid var(--im-accent)' : undefined,
                  }}
                  onClick={() => setFormat(f)}
                >
                  .{f} · {(CAPACITY_BYTES[f] / 1024).toFixed(0)} KB
                </span>
              ))}
            </div>
          </>
        )}

        {step === 2 && (
          <div className="im-flex im-gap-4">
            <Floppy3D size="sm" title={label || 'UNTITLED'} subtitle={`${system.toUpperCase()} · ${format.toUpperCase()}`} />
            <div className="im-flex-col im-gap-3" style={{ flex: 1 }}>
              <p className="im-text-2" style={{ margin: 0, fontSize: 'var(--im-fs-sm)' }}>{t('wizNameHint')}</p>
              <div className="im-field">
                <label className="im-label">{t('diskLabel')}</label>
                <input
                  className="im-input"
                  maxLength={16}
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="UNTITLED"
                  autoFocus
                />
              </div>
              <div className="im-field">
                <label className="im-label">{t('diskFolder')}</label>
                <div className="im-flex im-gap-2">
                  <input className="im-input" value={folder} onChange={(e) => setFolder(e.target.value)} />
                  <button className="im-btn" onClick={pickFolder}><Folder size={16} />{t('chooseFolder')}</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="im-dialog-footer">
        <button className="im-btn im-btn--ghost" onClick={closeDialog}>{t('btnCancel')}</button>
        <div className="im-grow" />
        {step > 0 && (
          <button className="im-btn" onClick={() => setStep((s) => s - 1)}><ArrowLeft size={16} />{t('btnBack')}</button>
        )}
        {step < STEPS.length - 1 && (
          <button className="im-btn im-btn--primary" disabled={!canContinue} onClick={() => setStep((s) => s + 1)}>
            {t('btnContinue')}<ArrowRight size={16} />
          </button>
        )}
        {step === STEPS.length - 1 && (
          <button className="im-btn im-btn--primary" disabled={!canContinue || busy} onClick={finish}>
            <FloppyPlus size={16} />{busy ? t('statLoading') : t('wizCreate')}
          </button>
        )}
      </div>
    </div>
  )
}
