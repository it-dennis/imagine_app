import React, { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CodeEditor } from './CodeEditor'
import { useEditorStore } from '../state/editor.store'
import { useUIStore } from '../state/ui.store'
import { isDirty, loadDocument, defaultLoadAddress, type EditorDoc, type EditorKind } from '../lib/editor-doc'
import { assembleCurrent, confirmDiscard, reloadCurrent, saveAndRun, saveCurrent } from '../lib/editor-actions'
import { DIALECTS, tokenize, type DialectId } from '../lib/lang/basic'
import { assemble } from '../lib/lang/assembler'
import type { DiskFile, VirtualDisk } from '../../shared/types'

interface Props {
  kind: EditorKind
  disk: VirtualDisk
  /** The file selected in the list, or null. */
  file: DiskFile | null
}

const CBM = ['c64', 'vic20', 'plus4', 'c128']

/** True when the open document is the given file (compared by directory entry, not by name). */
export function docIsFile(doc: EditorDoc | null, disk: VirtualDisk, file: DiskFile | null, kind: EditorKind): boolean {
  if (!doc || doc.diskId !== disk.id || doc.kind !== kind) return false
  if (!doc.ref) return file === null // an unsaved new file
  if (!file) return false
  return doc.ref.startTrack !== undefined && doc.ref.startSector !== undefined
    ? doc.ref.startTrack === file.startTrack && doc.ref.startSector === file.startSector
    : (doc.ref.path ?? doc.ref.name) === (file.path ?? file.name)
}

const hex = (n: number) => `$${n.toString(16).toUpperCase().padStart(4, '0')}`

export const EditorPane: React.FC<Props> = ({ kind, disk, file }) => {
  const { t } = useTranslation()
  const { doc, saveError, open, setText, patch } = useEditorStore()
  const openDialog = useUIStore((s) => s.openDialog)
  const [loadError, setLoadError] = useState<string | null>(null)
  const matches = docIsFile(doc, disk, file, kind)
  const dirty = isDirty(doc)
  const fileKey = file ? `${file.startTrack ?? ''}:${file.startSector ?? ''}:${file.path ?? file.name}` : ''

  // Open the selected file once, unless unsaved work in another document would be replaced.
  useEffect(() => {
    if (!file || matches || (doc && dirty)) return
    let cancelled = false
    setLoadError(null)
    loadDocument(disk, file, kind)
      .then((d) => { if (!cancelled) open(d) })
      .catch((e) => { if (!cancelled) setLoadError(e instanceof Error ? e.message : String(e)) })
    return () => { cancelled = true }
  }, [disk.id, kind, fileKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const analysis = useMemo(() => {
    if (!matches || !doc) return null
    if (doc.kind === 'basic') {
      const r = tokenize(doc.text, DIALECTS[doc.dialect], doc.loadAddress)
      return { errors: r.errors, warnings: r.warnings }
    }
    if (doc.kind === 'asm') {
      const r = assemble(doc.text, defaultLoadAddress(doc.system, doc.dialect))
      return { errors: r.errors, warnings: r.warnings }
    }
    return null
  }, [matches, doc?.text, doc?.dialect, doc?.loadAddress, doc?.kind]) // eslint-disable-line react-hooks/exhaustive-deps

  const center = (text: string) => (
    <div className="im-center im-text-3" style={{ height: '100%', fontSize: 'var(--im-fs-sm)', textAlign: 'center', padding: 'var(--im-s-5)' }}>{text}</div>
  )

  if (loadError) return center(loadError)

  if (!matches || !doc) {
    if (doc && dirty) {
      // another document has unsaved changes: ask before replacing it
      return (
        <div className="im-center im-flex-col im-gap-3" style={{ height: '100%', padding: 'var(--im-s-5)', textAlign: 'center' }}>
          <div style={{ fontSize: 'var(--im-fs-sm)' }}>{t('edUnsavedBody', { name: doc.name })}</div>
          <div className="im-flex im-gap-2">
            <button className="im-btn im-btn--primary" onClick={async () => { if (await saveCurrent(t)) useEditorStore.getState().close() }}>{t('edBtnSave')}</button>
            <button className="im-btn" onClick={() => useEditorStore.getState().close()}>{t('edBtnDiscard')}</button>
          </div>
        </div>
      )
    }
    return (
      <div className="im-center im-flex-col im-gap-3" style={{ height: '100%', padding: 'var(--im-s-5)', textAlign: 'center' }}>
        <div className="im-text-3" style={{ fontSize: 'var(--im-fs-sm)' }}>{file ? t('statLoading') : t('edNoFile')}</div>
        {!file && <button className="im-btn" onClick={() => openDialog('newFile')}>{t('edNewFile')}</button>}
      </div>
    )
  }

  const cbm = CBM.includes(disk.system)
  const readOnly = !!doc.readOnlyReason
  const canRun = cbm && (doc.kind === 'asm' || doc.kind === 'basic') && !readOnly
  const changeDialect = (id: DialectId) => {
    const wasDefault = doc.loadAddress === defaultLoadAddress(doc.system, doc.dialect)
    patch({ dialect: id, loadAddress: wasDefault ? defaultLoadAddress(doc.system, id) : doc.loadAddress })
  }

  return (
    <div className="im-flex-col" style={{ height: '100%', minHeight: 0 }}>
      <div className="im-flex im-gap-2" style={{ alignItems: 'center', padding: 'var(--im-s-2) var(--im-s-3)', borderBottom: '1px solid var(--im-line-soft)', flexWrap: 'wrap' }}>
        <span className="im-mono" style={{ fontSize: 'var(--im-fs-sm)' }}>{doc.name}</span>
        {dirty && <span title={t('edModified')} style={{ color: 'var(--im-warning)' }}>●</span>}
        {readOnly && <span className="im-badge">{t('edReadOnly')}</span>}
        <div className="im-grow" />
        {doc.kind === 'basic' && (
          <>
            <label className="im-text-3" style={{ fontSize: 'var(--im-fs-xs)' }}>{t('edDialect')}</label>
            <select className="im-input" style={{ width: 'auto' }} value={doc.dialect} disabled={readOnly} onChange={(e) => changeDialect(e.target.value as DialectId)}>
              {(Object.keys(DIALECTS) as DialectId[]).map((id) => <option key={id} value={id}>{DIALECTS[id].label}</option>)}
            </select>
            <span className="im-text-3 im-mono" style={{ fontSize: 'var(--im-fs-xs)' }} title={t('edLoadAddr')}>{hex(doc.loadAddress)}</span>
          </>
        )}
        <button className="im-btn" onClick={() => openDialog('newFile')}>{t('edNewFile')}</button>
        <button className="im-btn" onClick={async () => { if (await confirmDiscard(t)) useEditorStore.getState().close() }}>{t('edClose')}</button>
        <button className="im-btn im-btn--primary" disabled={readOnly || !dirty} onClick={() => void saveCurrent(t)}>{t('edSave')}</button>
        {cbm && doc.kind === 'asm' && <button className="im-btn" onClick={() => void assembleCurrent(t, false)}>{t('edAssemble')}</button>}
        {canRun && <button className="im-btn" disabled={readOnly} onClick={() => void saveAndRun(t)}>{doc.kind === 'asm' ? t('edAssembleRun') : t('edSaveRun')}</button>}
      </div>

      {doc.readOnlyReason && (
        <div style={{ padding: 'var(--im-s-2) var(--im-s-3)', background: 'var(--im-bg-2)', color: 'var(--im-warning)', fontSize: 'var(--im-fs-sm)' }}>{doc.readOnlyReason}</div>
      )}
      {saveError && (
        <div className="im-flex im-gap-2" style={{ alignItems: 'center', padding: 'var(--im-s-2) var(--im-s-3)', background: 'var(--im-bg-2)', color: 'var(--im-danger)', fontSize: 'var(--im-fs-sm)', userSelect: 'text' }}>
          <span className="im-grow" style={{ whiteSpace: 'pre-wrap' }}>{saveError}</span>
          {doc.ref && <button className="im-btn" onClick={() => void reloadCurrent()}>{t('edReload')}</button>}
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0 }}>
        <CodeEditor
          docKey={doc.id}
          value={doc.text}
          language={doc.kind === 'basic' ? 'basic' : doc.kind === 'asm' ? 'asm' : 'plain'}
          dialect={doc.dialect}
          separator={doc.separator}
          readOnly={readOnly}
          onChange={setText}
        />
      </div>

      {analysis && (analysis.errors.length > 0 || analysis.warnings.length > 0) && (
        <div data-testid="problems" style={{ maxHeight: 96, overflow: 'auto', borderTop: '1px solid var(--im-line-soft)', padding: 'var(--im-s-2) var(--im-s-3)', fontSize: 'var(--im-fs-xs)', userSelect: 'text' }}>
          {analysis.errors.slice(0, 20).map((e, i) => <div key={`e${i}`} style={{ color: 'var(--im-danger)' }}>{t('edLine')} {e.line}: {e.message}</div>)}
          {analysis.warnings.slice(0, 20).map((w, i) => <div key={`w${i}`} style={{ color: 'var(--im-warning)' }}>{t('edLine')} {w.line}: {w.message}</div>)}
        </div>
      )}
    </div>
  )
}
