import React from 'react'

interface Props {
  left?: string
  right?: string
  busy?: boolean
}

export const StatusBar: React.FC<Props> = ({
  left = 'Ready',
  right = 'v0.1.0 · Electron',
  busy = false,
}) => (
  <div className="im-statusbar">
    <span className="im-statusbar-item">
      <span
        className="im-statusbar-dot"
        style={{ background: busy ? 'var(--im-warning)' : 'var(--im-accent)' }}
      />
      {left}
    </span>
    <span className="im-statusbar-spacer" />
    <span className="im-statusbar-item">{right}</span>
  </div>
)
