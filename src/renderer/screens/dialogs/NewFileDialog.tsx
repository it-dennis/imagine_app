import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useUIStore } from '../../state/ui.store'
import { useWorkspaceStore } from '../../state/workspace.store'
import { useEditorStore } from '../../state/editor.store'
import { newDocument, type EditorKind } from '../../lib/editor-doc'
import { confirmDiscard } from '../../lib/editor-actions'
import { Close } from '../../components/icons'

const CBM = ['c64', 'vic20', 'plus4', 'c128']

export const NewFileDialog: React.FC = () => {
  const { t } = useTranslation()
  const { closeDialog, setActiveTab, addToast } = useUIStore()
  const disk = useWorkspaceStore((s) => s.disks.find((d) => d.id === s.activeDiskId) ?? null)
  const cbm = !!disk && CBM.includes(disk.system)
  const [kind, setKind] = useState<EditorKind>(cbm ? 'basic' : 'text')
  const [name, setName] = useState('')

  if (!disk) return null
  const clash = disk.files.some((f) => (f.path ?? f.name).toUpperCase() === name.trim().toUpperCase())
  const maxLen = cbm ? 16 : 255

  const create = async () => {
    const trimmed = name.trim()
    if (!trimmed || clash) return
    if (!(await confirmDiscard(t))) return
    useEditorStore.getState().open(newDocument(disk, trimmed, kind))
    setActiveTab(kind === 'basic' ? 'basic' : kind === 'asm' ? 'asm' : 'text')
    closeDialog()
    addToast({ intent: 'info', title: t('edNewFileHint'), description: trimmed, duration: 3000 })
  }

  return (
    <div className="im-dialog" style={{ minWidth: 420 }}>
      <div className="im-dialog-header">
        <span className="im-dialog-title" style={{ flex: 1 }}>{t('edNewFileTitle')}</span>
        <button className="im-btn im-btn--icon im-btn--ghost" onClick={closeDialog}><Close size={16} /></button>
      </div>
      <div className="im-dialog-body">
        <div className="im-field">
          <label className="im-label">{t('edFileKind')}</label>
          <select className="im-input" value={kind} onChange={(e) => setKind(e.target.value as EditorKind)}>
            {cbm && <option value="basic">{t('edKindBasic')}</option>}
            <option value="asm">{t('edKindAsm')}</option>
            <option value="text">{t('edKindText')}</option>
          </select>
        </div>
        <div className="im-field">
          <label className="im-label">{t('edFileName')}</label>
          <input
            className="im-input"
            autoFocus
            maxLength={maxLen}
            value={name}
            placeholder={kind === 'basic' ? 'PROGRAM' : kind === 'asm' ? 'SOURCE.ASM' : 'README.TXT'}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void create() }}
          />
          {clash && <div style={{ color: 'var(--im-danger)', fontSize: 'var(--im-fs-xs)' }}>{t('edNameTaken')}</div>}
        </div>
      </div>
      <div className="im-dialog-footer">
        <button className="im-btn im-btn--ghost" onClick={closeDialog}>{t('btnCancel')}</button>
        <div className="im-grow" />
        <button className="im-btn im-btn--primary" disabled={!name.trim() || clash} onClick={() => void create()}>{t('btnCreate')}</button>
      </div>
    </div>
  )
}
