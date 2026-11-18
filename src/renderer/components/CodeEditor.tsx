import React, { useEffect, useRef } from 'react'
import { EditorState, type Extension } from '@codemirror/state'
import {
  EditorView, drawSelection, highlightActiveLine, highlightActiveLineGutter, highlightSpecialChars,
  keymap, lineNumbers,
} from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search'
import { tags } from '@lezer/highlight'
import { asmLanguage, basicLanguage } from '../lib/lang/cm-languages'
import type { DialectId } from '../lib/lang/basic'
import type { Separator } from '../lib/lang/text-codec'

export type EditorLanguage = 'basic' | 'asm' | 'plain'

interface Props {
  /** Changing this rebuilds the editor (a different document was opened). */
  docKey: string
  value: string
  language: EditorLanguage
  dialect?: DialectId
  separator: Separator
  readOnly?: boolean
  onChange: (value: string) => void
}

// Reuses the existing token colour classes (tok-kw, tok-str, ...) so the editor matches the rest of the app.
const highlight = HighlightStyle.define([
  { tag: tags.keyword, class: 'tok-kw' },
  { tag: tags.string, class: 'tok-str' },
  { tag: tags.comment, class: 'tok-cmt' },
  { tag: tags.number, class: 'tok-num' },
  { tag: tags.atom, class: 'tok-addr' },
  { tag: tags.operator, class: 'tok-op' },
  { tag: tags.meta, class: 'tok-fn' },
  { tag: tags.labelName, class: 'tok-addr' },
])

const theme = EditorView.theme({
  '&': { height: '100%', backgroundColor: 'var(--im-bg-0)', color: 'var(--im-text-1)', fontSize: 'var(--im-fs-sm)' },
  '.cm-scroller': { fontFamily: 'var(--im-font-mono)', lineHeight: '1.6' },
  '.cm-content': { caretColor: 'var(--im-accent)', padding: '8px 0' },
  '.cm-cursor': { borderLeftColor: 'var(--im-accent)' },
  '.cm-gutters': { backgroundColor: 'var(--im-bg-1)', color: 'var(--im-text-4)', border: 'none', borderRight: '1px solid var(--im-line-soft)' },
  '.cm-activeLine': { backgroundColor: 'var(--im-bg-2)' },
  '.cm-activeLineGutter': { backgroundColor: 'var(--im-bg-2)', color: 'var(--im-text-2)' },
  '&.cm-focused': { outline: 'none' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': { backgroundColor: 'var(--im-accent-soft)' },
  '.cm-selectionMatch': { backgroundColor: 'var(--im-accent-soft)' },
  '.cm-panels': { backgroundColor: 'var(--im-bg-2)', color: 'var(--im-text-1)' },
  '.cm-searchMatch': { backgroundColor: 'var(--im-warning)', color: 'var(--im-accent-fg)' },
})

function languageExtension(language: EditorLanguage, dialect: DialectId): Extension {
  if (language === 'basic') return basicLanguage(dialect)
  if (language === 'asm') return asmLanguage
  return []
}

export const CodeEditor: React.FC<Props> = ({ docKey, value, language, dialect = 'v2', separator, readOnly = false, onChange }) => {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  // The text typed so far; kept so a dialect switch (which rebuilds the view) does not lose it.
  const latest = useRef(value)

  useEffect(() => {
    latest.current = value
  }, [docKey]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!host.current) return
    const state = EditorState.create({
      doc: latest.current,
      extensions: [
        EditorState.lineSeparator.of(separator),
        EditorState.readOnly.of(readOnly),
        EditorView.editable.of(!readOnly),
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightSpecialChars(),
        history(),
        drawSelection(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        keymap.of([...searchKeymap, ...defaultKeymap, ...historyKeymap]),
        languageExtension(language, dialect),
        syntaxHighlighting(highlight),
        theme,
        EditorView.updateListener.of((u) => {
          if (u.docChanged) {
            latest.current = u.state.sliceDoc()
            onChangeRef.current(latest.current)
          }
        }),
      ],
    })
    const v = new EditorView({ state, parent: host.current })
    view.current = v
    return () => {
      v.destroy()
      view.current = null
    }
  }, [docKey, language, dialect, separator, readOnly])

  return <div ref={host} className="im-codeeditor" data-testid="code-editor" style={{ height: '100%', minHeight: 0 }} />
}
