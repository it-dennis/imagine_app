import React from 'react'
import { useTranslation } from 'react-i18next'
import { useUIStore } from '../../state/ui.store'
import { useWorkspaceStore } from '../../state/workspace.store'
import { Trash, Warning } from '../../components/icons'

export const DeleteDialog: React.FC = () => {
  const { t } = useTranslation()
  const closeDialog = useUIStore((s) => s.closeDialog)
  const addToast = useUIStore((s) => s.addToast)
  const { disks, activeDiskId, removeDisk } = useWorkspaceStore()
  const disk = disks.find((d) => d.id === activeDiskId) ?? null

  const confirm = async () => {
    if (!disk) return
    try {
      await window.imagineAPI.disk.delete(disk.id)
    } catch {
      // disk was never registered in the main process (e.g. already closed) — safe to ignore
    }
    removeDisk(disk.id)
    addToast({ intent: 'info', title: t('deleteConfirm'), description: disk.name })
    closeDialog()
  }

  return (
    <div className="im-dialog" style={{ minWidth: 420 }}>
      <div className="im-dialog-header">
        <span className="im-dialog-icon" style={{ color: 'var(--im-danger)' }}><Trash size={18} /></span>
        <span className="im-dialog-title">{t('deleteTitle')}</span>
      </div>
      <div className="im-dialog-body">
        <div className="im-flex im-gap-3" style={{ alignItems: 'flex-start' }}>
          <Warning size={20} color="var(--im-warning)" />
          <p style={{ margin: 0, fontSize: 'var(--im-fs-sm)' }}>
            {t('deleteBody', { name: disk ? `${disk.name}.${disk.format.toUpperCase()}` : '' })}
          </p>
        </div>
      </div>
      <div className="im-dialog-footer">
        <button className="im-btn im-btn--ghost" onClick={closeDialog}>{t('btnCancel')}</button>
        <button className="im-btn im-btn--danger" onClick={confirm}>{t('deleteConfirm')}</button>
      </div>
    </div>
  )
}
