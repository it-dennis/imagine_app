import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useWorkspaceStore } from '../state/workspace.store'
import { useUIStore } from '../state/ui.store'
import { Floppy3D } from '../components/Floppy3D'
import { HexViewer } from '../components/HexViewer'
import { CodeView } from '../components/CodeView'
import { FloppyPlus, HardDrive, Code, Terminal, Eye } from '../components/icons'
import type { ActiveTab, System } from '../../shared/types'

const TABS: { id: ActiveTab; labelKey: string; Icon: React.FC<{ size?: number }> }[] = [
  { id: 'files', labelKey: 'tabFiles', Icon: HardDrive },
  { id: 'basic', labelKey: 'tabBasic', Icon: Code },
  { id: 'asm',   labelKey: 'tabAsm',   Icon: Terminal },
  { id: 'hex',   labelKey: 'tabHex',   Icon: Eye },
]

const CBM_6502_SYSTEMS: System[] = ['c64', 'vic20', 'plus4']

export const LoadedDiskScreen: React.FC = () => {
  const { t } = useTranslation()
  const { disks, activeDiskId, setActiveDisk } = useWorkspaceStore()
  const { activeTab, setActiveTab, openDialog, sidebarVisible } = useUIStore()
  const disk = disks.find((d) => d.id === activeDiskId) ?? null
  const [selectedPath, setSelectedPath] = useState<string | null>(null)

  useEffect(() => {
    setSelectedPath(null)
  }, [disk?.id])

  return (
    <div className="im-flex" style={{ flex: 1, minHeight: 0 }}>
      {sidebarVisible && <aside className="im-sidebar">
        <div className="im-sidebar-header">
          <span className="im-sidebar-title">{t('sbDiskettes')}</span>
          <button className="im-btn im-btn--icon im-btn--ghost" title={t('sbNewDisk')} onClick={() => openDialog('newDisk')}>
            <FloppyPlus size={16} />
          </button>
        </div>
        <ul className="im-list">
          {disks.map((d) => (
            <li
              key={d.id}
              className={`im-list-item${d.id === activeDiskId ? ' active' : ''}`}
              onClick={() => setActiveDisk(d.id)}
            >
              <Floppy3D size="sm" title={d.name} subtitle={`${d.system.toUpperCase()} · ${d.format.toUpperCase()}`} />
              <div className="im-flex-col im-gap-1" style={{ minWidth: 0 }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</span>
                <span className="im-text-3 im-mono" style={{ fontSize: 'var(--im-fs-xs)' }}>
                  {d.format.toUpperCase()}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </aside>}

      <div className="im-flex-col" style={{ flex: 1, minWidth: 0 }}>
        <div className="im-tabs">
          {TABS.map(({ id, labelKey, Icon }) => (
            <div
              key={id}
              className={`im-tab${activeTab === id ? ' active' : ''}`}
              onClick={() => setActiveTab(id)}
            >
              <Icon size={14} />
              {t(labelKey)}
            </div>
          ))}
        </div>

        <div style={{ flex: 1, overflow: 'auto' }}>
          {activeTab === 'files' && disk && (
            <table className="im-table">
              <thead>
                <tr>
                  <th>{t('fbName')}</th>
                  <th>{t('fbType')}</th>
                  <th>{t('fbSize')}</th>
                </tr>
              </thead>
              <tbody>
                {disk.files.map((f) => {
                  const isFile = f.type !== 'DIR'
                  return (
                    <tr
                      key={f.path ?? f.name}
                      className={isFile && f.path === selectedPath ? 'active' : undefined}
                      style={isFile ? { cursor: 'pointer' } : undefined}
                      onClick={isFile ? () => { setSelectedPath(f.path ?? f.name); setActiveTab('hex') } : undefined}
                    >
                      <td>{f.path ?? f.name}</td>
                      <td>{f.type}</td>
                      <td>{f.blocks} blk / {f.sizeBytes} B</td>
                    </tr>
                  )
                })}
                {disk.files.length === 0 && (
                  <tr>
                    <td colSpan={3} className="im-text-3" style={{ padding: 'var(--im-s-5)', textAlign: 'center' }}>
                      {t('diskEmpty')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}

          {activeTab === 'hex' && disk && selectedPath && (
            <HexViewer diskId={disk.id} path={selectedPath} />
          )}

          {activeTab === 'hex' && (!disk || !selectedPath) && (
            <div className="im-center im-text-3" style={{ height: '100%', fontSize: 'var(--im-fs-sm)' }}>
              Wähle eine Datei in der Dateiliste, um sie im Hex-Viewer zu öffnen.
            </div>
          )}

          {(activeTab === 'basic' || activeTab === 'asm') && disk && !CBM_6502_SYSTEMS.includes(disk.system) && (
            <div className="im-center im-text-3" style={{ height: '100%', fontSize: 'var(--im-fs-sm)' }}>
              {t(TABS.find((tb) => tb.id === activeTab)!.labelKey)} ist nur für C64/VIC-20/Plus4-Disketten (6502-Maschinencode) verfügbar.
            </div>
          )}

          {(activeTab === 'basic' || activeTab === 'asm') && disk && CBM_6502_SYSTEMS.includes(disk.system) && selectedPath && (
            <CodeView diskId={disk.id} path={selectedPath} mode={activeTab} />
          )}

          {(activeTab === 'basic' || activeTab === 'asm') && (!disk || (CBM_6502_SYSTEMS.includes(disk.system) && !selectedPath)) && (
            <div className="im-center im-text-3" style={{ height: '100%', fontSize: 'var(--im-fs-sm)' }}>
              Wähle eine Datei in der Dateiliste, um sie hier anzuzeigen.
            </div>
          )}
        </div>
      </div>

      {disk && (
        <aside className="im-panel" style={{ width: 'var(--im-inspector-w)', borderRadius: 0, borderTop: 'none', borderBottom: 'none', borderRight: 'none' }}>
          <div className="im-panel-header">
            <span className="im-panel-title">{t('diskInfo')}</span>
          </div>
          <div className="im-panel-body im-flex-col im-gap-3">
            {[
              [t('diskName'), disk.name],
              [t('diskSystem'), disk.system.toUpperCase()],
              [t('diskFormat'), disk.format.toUpperCase()],
              [t('diskCapacity'), `${disk.capacityBytes.toLocaleString()} B`],
              [t('diskFree'), `${disk.freeBytes.toLocaleString()} B`],
              [t('diskFiles'), String(disk.files.length)],
              [t('diskCreated'), disk.createdAt],
              [t('diskWriteProtect'), disk.writeProtected ? t('btnConfirm') : '—'],
            ].map(([label, value]) => (
              <div key={label} className="im-flex" style={{ justifyContent: 'space-between', fontSize: 'var(--im-fs-sm)' }}>
                <span className="im-text-3">{label}</span>
                <span className="im-mono">{value}</span>
              </div>
            ))}
          </div>
        </aside>
      )}
    </div>
  )
}
