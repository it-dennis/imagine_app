import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useUIStore } from '../state/ui.store'

export const MenuBar: React.FC = () => {
  const { t } = useTranslation()
  const openDialog = useUIStore((s) => s.openDialog)
  const [active, setActive] = useState<string | null>(null)

  const item = (key: string, label: string, onClick?: () => void) => (
    <div
      className={`im-menubar-item${active === key ? ' active' : ''}`}
      onClick={() => { setActive(active === key ? null : key); onClick?.() }}
    >
      {label}
    </div>
  )

  return (
    <div className="im-menubar" onClick={(e) => { if (e.target === e.currentTarget) setActive(null) }}>
      {item('file', t('menuFile'))}
      {item('edit', t('menuEdit'))}
      {item('view', t('menuView'))}
      {item('tools', t('menuTools'))}
      {item('help', t('menuHelp'), () => openDialog('about'))}
    </div>
  )
}
