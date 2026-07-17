import React from 'react'

interface Props {
  title?: string
  showTraffic?: boolean
}

export const TitleBar: React.FC<Props> = ({
  title = 'Imagine — Disk Image Engine',
  showTraffic = true,
}) => (
  <div className="im-titlebar">
    {showTraffic && (
      <div className="im-titlebar-traffic">
        <span className="im-traffic-dot close" />
        <span className="im-traffic-dot minimize" />
        <span className="im-traffic-dot maximize" />
      </div>
    )}
    <div className="im-titlebar-title">{title}</div>
    <div style={{ width: 60 }} />
  </div>
)
