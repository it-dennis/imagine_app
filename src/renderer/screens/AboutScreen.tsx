import React from 'react'
import { useTranslation } from 'react-i18next'
import { useUIStore } from '../state/ui.store'
import { Lockup } from '../components/logos'
import { Close } from '../components/icons'

const CREDITS = ['React', 'Electron', 'Zustand', 'i18next', 'Monaco Editor']

export const AboutScreen: React.FC = () => {
  const { t } = useTranslation()
  const closeDialog = useUIStore((s) => s.closeDialog)

  return (
    <div className="im-dialog" style={{ minWidth: 420 }}>
      <div className="im-dialog-header">
        <span className="im-dialog-title" style={{ flex: 1 }}>{t('miAbout')}</span>
        <button className="im-btn im-btn--icon im-btn--ghost" onClick={closeDialog}><Close size={16} /></button>
      </div>

      <div className="im-dialog-body im-center" style={{ flexDirection: 'column', gap: 'var(--im-s-5)', padding: 'var(--im-s-8) var(--im-s-5)' }}>
        <Lockup size={26} showTagline />

        <div className="im-flex-col im-gap-2" style={{ width: '100%', fontSize: 'var(--im-fs-sm)' }}>
          <div className="im-flex" style={{ justifyContent: 'space-between' }}>
            <span className="im-text-3">{t('aboutVersion')}</span>
            <span className="im-mono">0.1.0</span>
          </div>
          <div className="im-flex" style={{ justifyContent: 'space-between' }}>
            <span className="im-text-3">{t('aboutLicense')}</span>
            <span>GNU GPL v3</span>
          </div>
        </div>

        <div className="im-hr" style={{ width: '100%' }} />

        <div style={{ width: '100%' }}>
          <div className="im-uppercase im-text-3" style={{ marginBottom: 'var(--im-s-2)' }}>{t('aboutCredits')}</div>
          <div className="im-flex im-gap-2" style={{ flexWrap: 'wrap' }}>
            {CREDITS.map((c) => <span key={c} className="im-badge">{c}</span>)}
          </div>
        </div>

        <div className="im-text-3" style={{ fontSize: 'var(--im-fs-xs)', textAlign: 'center' }}>
          {t('aboutThanks')} — Dennis Rapp &amp; die Retro-Computing-Community.
        </div>
      </div>

      <div className="im-dialog-footer">
        <button className="im-btn im-btn--primary" onClick={closeDialog}>{t('btnDone')}</button>
      </div>
    </div>
  )
}
