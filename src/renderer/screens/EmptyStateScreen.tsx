import React from 'react'
import { useTranslation } from 'react-i18next'
import { useUIStore } from '../state/ui.store'
import { FloppyPlus, FolderOpen, Disc } from '../components/icons'
import type { DialogId } from '../../shared/types'

export const EmptyStateScreen: React.FC = () => {
  const { t } = useTranslation()
  const openDialog = useUIStore((s) => s.openDialog)

  const card = (
    Icon: React.FC<{ size?: number }>,
    title: string,
    desc: string,
    dialog: DialogId,
  ) => (
    <button className="im-action-card" onClick={() => openDialog(dialog)}>
      <span className="im-action-card-icon">
        <Icon size={20} />
      </span>
      <span className="im-action-card-title">{title}</span>
      <span className="im-action-card-desc">{desc}</span>
    </button>
  )

  return (
    <div className="im-center im-grow" style={{ flexDirection: 'column', gap: 'var(--im-s-8)' }}>
      <div style={{ textAlign: 'center', maxWidth: 440 }}>
        <div style={{ fontSize: 'var(--im-fs-xl)', fontWeight: 600, marginBottom: 'var(--im-s-2)' }}>
          {t('emptyTitle')}
        </div>
        <div className="im-text-2" style={{ fontSize: 'var(--im-fs-sm)' }}>
          {t('emptySubtitle')}
        </div>
      </div>

      <div className="im-flex im-gap-4">
        {card(FloppyPlus, t('emptyCardNew'), t('emptyCardNewDesc'), 'newDisk')}
        {card(FolderOpen, t('emptyCardOpen'), t('emptyCardOpenDesc'), 'fileBrowser')}
        {card(Disc, t('emptyCardIso'), t('emptyCardIsoDesc'), 'iso')}
      </div>
    </div>
  )
}
