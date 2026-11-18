import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useWorkspaceStore } from '../state/workspace.store'
import { useUIStore } from '../state/ui.store'
import { useEditorStore } from '../state/editor.store'
import { Floppy3D } from '../components/Floppy3D'
import { HexViewer } from '../components/HexViewer'
import { CodeView } from '../components/CodeView'
import { EditorPane } from '../components/EditorPane'
import { FloppyPlus, HardDrive, Code, Terminal, Eye, Edit } from '../components/icons'
import type { ActiveTab, DiskFile, System } from '../../shared/types'

const TABS: { id: ActiveTab; labelKey: string; Icon: React.FC<{ size?: number }> }[] = [
  { id: 'files', labelKey: 'tabFiles', Icon: HardDrive },
  { id: 'basic', labelKey: 'tabBasic', Icon: Code },
  { id: 'asm',   labelKey: 'tabAsm',   Icon: Terminal },
  { id: 'text',  labelKey: 'tabText',  Icon: Edit },
  { id: 'hex',   labelKey: 'tabHex',   Icon: Eye },
]

const CBM_6502_SYSTEMS: System[] = ['c64', 'vic20', 'plus4', 'c128']
const BASIC_START = [0x0801, 0x1001, 0x1201, 0x1c01]

const keyOf = (f: DiskFile) => `${f.startTrack ?? ''}:${f.startSector ?? ''}:${f.path ?? f.name}`

export const LoadedDiskScreen: React.FC = () => {
  const { t } = useTranslation()
  const { disks, activeDiskId, setActiveDisk } = useWorkspaceStore()
  const { activeTab, setActiveTab, openDialog, sidebarVisible } = useUIStore()
  const doc = useEditorStore((s) => s.doc)
  const disk = disks.find((d) => d.id === activeDiskId) ?? null
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [asmMode, setAsmMode] = useState<'disassembly' | 'source'>('disassembly')
  const selected = disk?.files.find((f) => keyOf(f) === selectedKey) ?? null
  const cbm = !!disk && CBM_6502_SYSTEMS.includes(disk.system)

  useEffect(() => {
    setSelectedKey(null)
  }, [disk?.id])

  // a source document that was just opened or created belongs in the source view, not the disassembly
  useEffect(() => {
    if (doc?.kind === 'asm') setAsmMode('source')
  }, [doc?.id, doc?.kind])

  // After a save the file can start at a different sector; keep the selection on the open document.
  useEffect(() => {
    if (!disk || !doc?.ref || doc.diskId !== disk.id) return
    const ref = doc.ref
    const f = disk.files.find((x) =>
      ref.startTrack !== undefined ? x.startTrack === ref.startTrack && x.startSector === ref.startSector : (x.path ?? x.name) === (ref.path ?? ref.name),
    )
    if (f) setSelectedKey(keyOf(f))
  }, [disk?.files, doc?.ref]) // eslint-disable-line react-hooks/exhaustive-deps

  // Double click: open the file in the editor that fits it.
  const openFile = async (f: DiskFile) => {
    if (!disk || f.type === 'DIR') return
    setSelectedKey(keyOf(f))
    if (cbm && f.type === 'PRG') {
      try {
        const { data } = await window.imagineAPI.disk.openFile(disk.id, f)
        const b0 = atob(data.slice(0, 4)) // first bytes: the load address
        const load = b0.length >= 2 ? b0.charCodeAt(0) | (b0.charCodeAt(1) << 8) : 0
        setActiveTab(BASIC_START.includes(load) ? 'basic' : 'asm')
        if (!BASIC_START.includes(load)) setAsmMode('disassembly')
      } catch {
        setActiveTab('hex')
      }
      return
    }
    setActiveTab('text')
  }

  const hint = (text: string) => (
    <div className="im-center im-text-3" style={{ height: '100%', fontSize: 'var(--im-fs-sm)', textAlign: 'center', padding: 'var(--im-s-5)' }}>{text}</div>
  )

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

        <div style={{ flex: 1, overflow: activeTab === 'files' || activeTab === 'hex' ? 'auto' : 'hidden', minHeight: 0 }}>
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
                      key={keyOf(f)}
                      className={isFile && keyOf(f) === selectedKey ? 'active' : undefined}
                      style={isFile ? { cursor: 'pointer' } : undefined}
                      onClick={isFile ? () => setSelectedKey(keyOf(f)) : undefined}
                      onDoubleClick={isFile ? () => void openFile(f) : undefined}
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

          {activeTab === 'hex' && disk && selected && <HexViewer diskId={disk.id} path={selected.path ?? selected.name} />}
          {activeTab === 'hex' && (!disk || !selected) && hint('Wähle eine Datei in der Dateiliste, um sie im Hex-Viewer zu öffnen.')}

          {activeTab === 'basic' && disk && !cbm && hint(`${t('tabBasic')} ist nur für Commodore-Disketten (C64, VIC-20, Plus/4, C128) verfügbar.`)}
          {activeTab === 'basic' && disk && cbm && <EditorPane kind="basic" disk={disk} file={selected} />}

          {activeTab === 'asm' && disk && !cbm && hint(`${t('tabAsm')} ist nur für Commodore-Disketten (6502-Maschinencode) verfügbar.`)}
          {activeTab === 'asm' && disk && cbm && (
            <div className="im-flex-col" style={{ height: '100%', minHeight: 0 }}>
              <div className="im-flex im-gap-2" style={{ padding: 'var(--im-s-2) var(--im-s-3)', borderBottom: '1px solid var(--im-line-soft)' }}>
                <button className={`im-btn${asmMode === 'disassembly' ? ' im-btn--primary' : ''}`} onClick={() => setAsmMode('disassembly')}>{t('asmModeDisassembly')}</button>
                <button className={`im-btn${asmMode === 'source' ? ' im-btn--primary' : ''}`} onClick={() => setAsmMode('source')}>{t('asmModeSource')}</button>
              </div>
              <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
                {asmMode === 'source'
                  ? <EditorPane kind="asm" disk={disk} file={selected} />
                  : selected ? <CodeView diskId={disk.id} path={selected.path ?? selected.name} /> : hint('Wähle eine Datei in der Dateiliste, um sie hier anzuzeigen.')}
              </div>
            </div>
          )}

          {activeTab === 'text' && disk && <EditorPane kind="text" disk={disk} file={selected} />}
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
