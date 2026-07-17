import React from 'react'

interface Props {
  title?: string
  subtitle?: string
  accent?: string
  size?: 'sm' | 'md' | 'lg'
}

const SIZES = { sm: 28, md: 200, lg: 260 }

export const Floppy3D: React.FC<Props> = ({
  title = 'UNTITLED',
  subtitle = 'C64 · D64',
  accent,
  size = 'md',
}) => {
  const w = SIZES[size]
  return (
    <div
      className={`im-floppy${size === 'sm' ? ' sm' : ''}`}
      style={{ width: w, ...(accent ? { '--im-accent': accent } as React.CSSProperties : {}) }}
    >
      <div className="im-floppy-label">
        <div className="im-floppy-label-band" />
        <div className="im-floppy-label-title">{title}</div>
        <div className="im-floppy-label-meta">{subtitle}</div>
      </div>
    </div>
  )
}
