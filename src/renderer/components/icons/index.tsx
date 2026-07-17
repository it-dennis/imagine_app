import React from 'react'

interface IconProps {
  size?: number
  color?: string
  strokeWidth?: number
  style?: React.CSSProperties
  className?: string
}

const _Icon = (children: React.ReactNode, vb = '0 0 24 24') =>
  ({ size = 18, color = 'currentColor', strokeWidth = 1.6, style, className }: IconProps = {}) => (
    <svg
      width={size}
      height={size}
      viewBox={vb}
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      className={className}
    >
      {children}
    </svg>
  )

export const Floppy = _Icon(<>
  <path d="M5 4h11l3 3v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />
  <path d="M8 4v5h7V4" />
  <path d="M7 14h10v6H7z" />
  <path d="M10 17h4" />
</>)

export const FloppyPlus = _Icon(<>
  <path d="M5 4h9l3 3v6.5" />
  <path d="M5 4a1 1 0 0 0-1 1v15a1 1 0 0 0 1 1h7" />
  <path d="M8 4v5h6V4" />
  <circle cx="17.5" cy="17.5" r="3.5" />
  <path d="M17.5 15.5v4M15.5 17.5h4" />
</>)

export const FolderOpen = _Icon(<>
  <path d="M3 7a1 1 0 0 1 1-1h4l2 2h9a1 1 0 0 1 1 1v2" />
  <path d="M3 9h18l-2 9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9z" />
</>)

export const Folder = _Icon(<>
  <path d="M3 7a1 1 0 0 1 1-1h4l2 2h10a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7z" />
</>)

export const Cloud = _Icon(<>
  <path d="M7 18h10a4 4 0 0 0 .5-7.97A6 6 0 0 0 5.5 11.5 3.5 3.5 0 0 0 7 18z" />
</>)

export const HardDrive = _Icon(<>
  <rect x="3" y="13" width="18" height="6" rx="1" />
  <path d="M3 13l3-7h12l3 7" />
  <circle cx="7" cy="16" r="0.8" fill="currentColor" />
  <circle cx="10" cy="16" r="0.8" fill="currentColor" />
</>)

export const Disc = _Icon(<>
  <circle cx="12" cy="12" r="9" />
  <circle cx="12" cy="12" r="3" />
  <circle cx="12" cy="12" r="0.6" fill="currentColor" />
</>)

export const Play = _Icon(<>
  <path d="M7 5l12 7-12 7V5z" fill="currentColor" stroke="none" />
</>)

export const Stop = _Icon(<>
  <rect x="6" y="6" width="12" height="12" rx="1" fill="currentColor" stroke="none" />
</>)

export const Settings = _Icon(<>
  <circle cx="12" cy="12" r="3" />
  <path d="M19.4 14.5a1 1 0 0 0 .2 1.1l.05.05a2 2 0 1 1-2.83 2.83l-.05-.05a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.91V19a2 2 0 1 1-4 0v-.07a1 1 0 0 0-.66-.91 1 1 0 0 0-1.09.2l-.05.05a2 2 0 1 1-2.83-2.83l.05-.05a1 1 0 0 0 .2-1.1 1 1 0 0 0-.91-.6H5a2 2 0 1 1 0-4h.07a1 1 0 0 0 .91-.66 1 1 0 0 0-.2-1.09l-.05-.05a2 2 0 1 1 2.83-2.83l.05.05a1 1 0 0 0 1.1.2H10a1 1 0 0 0 .6-.91V5a2 2 0 1 1 4 0v.07a1 1 0 0 0 .6.91 1 1 0 0 0 1.1-.2l.05-.05a2 2 0 1 1 2.83 2.83l-.05.05a1 1 0 0 0-.2 1.1V10a1 1 0 0 0 .91.6H19a2 2 0 1 1 0 4h-.07a1 1 0 0 0-.91.6z" />
</>)

export const Trash = _Icon(<>
  <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
  <path d="M6 6l1 14a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-14" />
  <path d="M10 11v6M14 11v6" />
</>)

export const Refresh = _Icon(<>
  <path d="M21 12a9 9 0 1 1-3-6.7" />
  <path d="M21 4v5h-5" />
</>)

export const Power = _Icon(<>
  <path d="M12 3v9" />
  <path d="M5.6 7.4a8 8 0 1 0 12.8 0" />
</>)

export const Plus = _Icon(<>
  <path d="M12 5v14M5 12h14" />
</>)

export const Minus = _Icon(<>
  <path d="M5 12h14" />
</>)

export const Close = _Icon(<>
  <path d="M6 6l12 12M18 6L6 18" />
</>)

export const Check = _Icon(<>
  <path d="M5 12l5 5L20 7" />
</>)

export const ChevronRight = _Icon(<>
  <path d="M9 6l6 6-6 6" />
</>)

export const ChevronDown = _Icon(<>
  <path d="M6 9l6 6 6-6" />
</>)

export const Search = _Icon(<>
  <circle cx="11" cy="11" r="7" />
  <path d="M21 21l-5-5" />
</>)

export const Info = _Icon(<>
  <circle cx="12" cy="12" r="9" />
  <path d="M12 11v5M12 8v.01" />
</>)

export const Warning = _Icon(<>
  <path d="M10.3 3.86a2 2 0 0 1 3.4 0l8.4 14a2 2 0 0 1-1.7 3.04H3.6a2 2 0 0 1-1.7-3.04l8.4-14z" />
  <path d="M12 9v5M12 17v.01" />
</>)

export const Format = _Icon(<>
  <rect x="3" y="4" width="18" height="16" rx="2" />
  <path d="M7 9h10M7 13h6M7 17h4" />
</>)

export const Code = _Icon(<>
  <path d="M16 18l6-6-6-6M8 6l-6 6 6 6" />
</>)

export const Cpu = _Icon(<>
  <rect x="6" y="6" width="12" height="12" rx="1" />
  <rect x="9" y="9" width="6" height="6" rx="0.5" />
  <path d="M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3" />
</>)

export const Terminal = _Icon(<>
  <rect x="3" y="4" width="18" height="16" rx="2" />
  <path d="M7 9l3 3-3 3M13 15h4" />
</>)

export const Save = _Icon(<>
  <path d="M5 4h11l3 3v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />
  <path d="M8 4v5h7V4" />
  <path d="M7 14h10v6H7z" />
</>)

export const Eject = _Icon(<>
  <path d="M5 14l7-8 7 8z" fill="currentColor" stroke="none" />
  <rect x="5" y="17" width="14" height="2" rx="0.5" fill="currentColor" stroke="none" />
</>)

export const Eye = _Icon(<>
  <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
  <circle cx="12" cy="12" r="3" />
</>)

export const Drive = _Icon(<>
  <rect x="3" y="3" width="18" height="18" rx="1" />
  <rect x="6" y="6" width="12" height="6" rx="0.5" />
  <circle cx="8" cy="17" r="0.6" fill="currentColor" />
  <circle cx="11" cy="17" r="0.6" fill="currentColor" />
</>)

export const Question = _Icon(<>
  <circle cx="12" cy="12" r="9" />
  <path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 1.5-2.5 2-2.5 4M12 17v.01" />
</>)

export const ArrowRight = _Icon(<>
  <path d="M5 12h14M13 6l6 6-6 6" />
</>)

export const ArrowLeft = _Icon(<>
  <path d="M19 12H5M11 6l-6 6 6 6" />
</>)

export const Boot = _Icon(<>
  <path d="M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6l8-4z" />
  <path d="M9 12l2 2 4-4" />
</>)

export const Copy = _Icon(<>
  <rect x="9" y="9" width="11" height="11" rx="1" />
  <path d="M5 15V5a1 1 0 0 1 1-1h10" />
</>)

export const Edit = _Icon(<>
  <path d="M3 21h4l11-11-4-4L3 17v4z" />
  <path d="M14 6l4 4" />
</>)
