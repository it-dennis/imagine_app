import React from 'react'
import { useTranslation } from 'react-i18next'
import { Lockup } from '../components/logos'

export const SplashScreen: React.FC = () => {
  const { t } = useTranslation()

  return (
    <div
      className="im-center im-crt"
      style={{ height: '100vh', flexDirection: 'column', gap: 'var(--im-s-6)', background: 'var(--im-bg-0)' }}
    >
      <Lockup size={30} showTagline />
      <div className="im-progress" style={{ width: 180 }}>
        <div className="im-progress-bar im-splash-bar" />
      </div>
      <div className="im-text-3 im-mono" style={{ fontSize: 'var(--im-fs-xs)', letterSpacing: '0.08em' }}>
        {t('statLoading')}
      </div>
    </div>
  )
}
