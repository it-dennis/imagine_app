import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TitleBar } from './chrome/TitleBar'
import { MenuBar } from './chrome/MenuBar'
import { ToolBar } from './chrome/ToolBar'
import { StatusBar } from './chrome/StatusBar'
import { SplashScreen } from './screens/SplashScreen'
import { EmptyStateScreen } from './screens/EmptyStateScreen'
import { LoadedDiskScreen } from './screens/LoadedDiskScreen'
import { NewDiskWizard } from './screens/wizard/NewDiskWizard'
import { FileBrowserDialog } from './screens/dialogs/FileBrowserDialog'
import { WriteFileDialog } from './screens/dialogs/WriteFileDialog'
import { FormatDialog } from './screens/dialogs/FormatDialog'
import { DeleteDialog } from './screens/dialogs/DeleteDialog'
import { IsoDialog } from './screens/dialogs/IsoDialog'
import { SettingsScreen } from './screens/SettingsScreen'
import { AboutScreen } from './screens/AboutScreen'
import { useWorkspaceStore } from './state/workspace.store'
import { useUIStore } from './state/ui.store'
import { usePrefsStore } from './state/prefs.store'
import { Check, Warning, Save } from './components/icons'

const FULL_DIALOGS = ['newDisk', 'fileBrowser', 'iso', 'settings', 'about']

export const App: React.FC = () => {
  const { t } = useTranslation()
  const [showSplash, setShowSplash] = useState(true)
  const { disks, activeDiskId } = useWorkspaceStore()
  const { activeDialog, closeDialog, toasts, removeToast } = useUIStore()
  const { theme, accent, font } = usePrefsStore()
  const activeDisk = disks.find((d) => d.id === activeDiskId) ?? null

  useEffect(() => {
    const timer = setTimeout(() => setShowSplash(false), 1500)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    document.body.dataset.theme = theme
    document.body.dataset.accent = accent
    document.body.dataset.font = font
  }, [theme, accent, font])

  if (showSplash) return <SplashScreen />

  const dialogContent = activeDialog === 'newDisk'      ? <NewDiskWizard />
    : activeDialog === 'fileBrowser' ? <FileBrowserDialog />
    : activeDialog === 'writeFile'   ? <WriteFileDialog />
    : activeDialog === 'format'      ? <FormatDialog />
    : activeDialog === 'delete'      ? <DeleteDialog />
    : activeDialog === 'iso'         ? <IsoDialog />
    : activeDialog === 'settings'    ? <SettingsScreen />
    : activeDialog === 'about'       ? <AboutScreen />
    : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', position: 'relative' }}>
      <TitleBar title={activeDisk ? `${t('appName')} — ${activeDisk.name}.${activeDisk.format.toUpperCase()}` : `${t('appName')} — ${t('appTagline')}`} />
      <MenuBar />
      <ToolBar hasDisk={!!activeDisk} />

      <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
        {activeDisk ? <LoadedDiskScreen /> : <EmptyStateScreen />}
      </div>

      <StatusBar
        left={activeDisk ? `${t('statReady')} · ${activeDisk.name}.${activeDisk.format.toUpperCase()}` : t('statReady')}
        right="v0.1.0 · Electron · main"
      />

      {/* Dialog overlay */}
      {activeDialog && dialogContent && (
        <div
          style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}
          onClick={(e) => { if (e.target === e.currentTarget && !FULL_DIALOGS.includes(activeDialog)) closeDialog() }}
        >
          {dialogContent}
        </div>
      )}

      {/* Toast stack */}
      {toasts.length > 0 && (
        <div style={{ position: 'absolute', bottom: 40, right: 20, display: 'flex', flexDirection: 'column', gap: 8, zIndex: 200 }}>
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`im-toast im-toast--${toast.intent}`}
              onClick={() => removeToast(toast.id)}
              style={{ cursor: 'pointer' }}
            >
              {toast.intent === 'success' && <Check size={18} color="var(--im-success)" />}
              {toast.intent === 'info' && <Save size={18} color="var(--im-info)" />}
              {toast.intent === 'warning' && <Warning size={18} color="var(--im-warning)" />}
              {toast.intent === 'danger' && <Warning size={18} color="var(--im-danger)" />}
              <div className="im-toast-body">
                <div className="im-toast-title">{toast.title}</div>
                {toast.description && <div className="im-toast-text">{toast.description}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
