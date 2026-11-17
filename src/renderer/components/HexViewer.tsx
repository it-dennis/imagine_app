import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { base64ToBytes } from '../lib/base64'

const MAX_DISPLAY_BYTES = 8192

interface Props {
  diskId: string
  path: string
}

export const HexViewer: React.FC<Props> = ({ diskId, path }) => {
  const { t } = useTranslation()
  const [bytes, setBytes] = useState<Uint8Array | null>(null)
  const [totalSize, setTotalSize] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setBytes(null)
    setError(null)
    window.imagineAPI.disk
      .readFile(diskId, path)
      .then((b64) => {
        if (cancelled) return
        const all = base64ToBytes(b64)
        setTotalSize(all.length)
        setBytes(all.subarray(0, MAX_DISPLAY_BYTES))
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
  }, [diskId, path])

  if (error) {
    return (
      <div className="im-center im-text-3" style={{ height: '100%', fontSize: 'var(--im-fs-sm)' }}>
        {error}
      </div>
    )
  }

  if (!bytes) {
    return (
      <div className="im-center im-text-3" style={{ height: '100%', fontSize: 'var(--im-fs-sm)' }}>
        {t('statLoading')}
      </div>
    )
  }

  const rows: React.ReactNode[] = []
  for (let offset = 0; offset < bytes.length; offset += 16) {
    const chunk = bytes.subarray(offset, offset + 16)
    const hex = Array.from(chunk).map((b) => b.toString(16).padStart(2, '0'))
    while (hex.length < 16) hex.push('  ')
    const ascii = Array.from(chunk)
      .map((b) => (b >= 0x20 && b <= 0x7e ? String.fromCharCode(b) : '.'))
      .join('')
    rows.push(
      <div key={offset} className="im-hex-row">
        <span className="im-hex-offset">{offset.toString(16).padStart(8, '0')}</span>
        <span className="im-hex-bytes">
          {hex.slice(0, 8).join(' ')}&nbsp;&nbsp;{hex.slice(8, 16).join(' ')}
        </span>
        <span className="im-hex-ascii">{ascii}</span>
      </div>,
    )
  }

  return (
    <div className="im-hexview">
      {rows}
      {totalSize > MAX_DISPLAY_BYTES && (
        <div className="im-text-3" style={{ padding: 'var(--im-s-3) 0', fontSize: 'var(--im-fs-xs)' }}>
          Zeige die ersten {MAX_DISPLAY_BYTES.toLocaleString()} von {totalSize.toLocaleString()} Bytes.
        </div>
      )}
    </div>
  )
}
