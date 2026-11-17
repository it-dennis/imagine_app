import React from 'react'
import { useTranslation } from 'react-i18next'
import { useUIStore } from '../../state/ui.store'
import { useWorkspaceStore } from '../../state/workspace.store'
import { Format, Warning } from '../../components/icons'

export const FormatDialog: React.FC = () => {
  const { t } = useTranslation()
  const closeDialog = useUIStore((s) => s.closeDialog)
  const addToast = useUIStore((s) => s.addToast)
  const { disks, activeDiskId, updateDisk } = useWorkspaceStore()
  const disk = disks.find((d) => d.id === activeDiskId) ?? null

  const confirm = async () => {
    if (!disk) return
    try {
      const updated = await window.imagineAPI.disk.format(disk.id)
      updateDisk(updated)
      addToast({ intent: 'success', title: t('toastFormatOk'), description: disk.name })
      closeDialog()
    } catch (err) {
      addToast({ intent: 'danger', title: t('toastErrorTitle'), description: err instanceof Error ? err.message : String(err) })
    }
  }

  return (
    <div className="im-dialog" style={{ minWidth: 420 }}>
      <div className="im-dialog-header">
        <span className="im-dialog-icon" style={{ color: 'var(--im-danger)' }}><Format size={18} /></span>
        <span className="im-dialog-title">{t('formatTitle')}</span>
      </div>
      <div className="im-dialog-body">
        <div className="im-flex im-gap-3" style={{ alignItems: 'flex-start' }}>
          <Warning size={20} color="var(--im-warning)" />
          <p style={{ margin: 0, fontSize: 'var(--im-fs-sm)' }}>
            {t('formatBody', { name: disk ? `${disk.name}.${disk.format.toUpperCase()}` : '' })}
          </p>
        </div>
      </div>
      <div className="im-dialog-footer">
        <button className="im-btn im-btn--ghost" onClick={closeDialog}>{t('btnCancel')}</button>
        <button className="im-btn im-btn--danger" onClick={confirm}>{t('formatConfirm')}</button>
      </div>
    </div>
  )
}
