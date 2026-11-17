import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { base64ToBytes } from '../lib/base64'
import { detokenizeBasic, type Token } from '../lib/basic'
import { disassemble6502 } from '../lib/disassembler'

interface Props {
  diskId: string
  path: string
  mode: 'basic' | 'asm'
}

export const CodeView: React.FC<Props> = ({ diskId, path, mode }) => {
  const { t } = useTranslation()
  const [lines, setLines] = useState<Token[][] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLines(null)
    setError(null)
    window.imagineAPI.disk
      .readFile(diskId, path)
      .then((b64) => {
        if (cancelled) return
        const bytes = base64ToBytes(b64)
        setLines(mode === 'basic' ? detokenizeBasic(bytes) : disassemble6502(bytes))
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
  }, [diskId, path, mode])

  if (error) {
    return (
      <div className="im-center im-text-3" style={{ height: '100%', fontSize: 'var(--im-fs-sm)' }}>
        {error}
      </div>
    )
  }

  if (!lines) {
    return (
      <div className="im-center im-text-3" style={{ height: '100%', fontSize: 'var(--im-fs-sm)' }}>
        {t('statLoading')}
      </div>
    )
  }

  if (lines.length === 0) {
    return (
      <div className="im-center im-text-3" style={{ height: '100%', fontSize: 'var(--im-fs-sm)' }}>
        {t('sbEmpty')}
      </div>
    )
  }

  return (
    <div className="im-editor">
      <div className="im-editor-gutter">
        {lines.map((_, i) => (
          <div key={i}>{i + 1}</div>
        ))}
      </div>
      <div className="im-editor-code">
        {lines.map((line, i) => (
          <div key={i}>
            {line.map((tok, j) => (
              <span key={j} className={tok.cls}>
                {tok.text}
              </span>
            ))}
            {line.length === 0 && ' '}
          </div>
        ))}
      </div>
    </div>
  )
}
