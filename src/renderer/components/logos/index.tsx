import React from 'react'

interface LogoProps {
  size?: number
  accent?: string
}

export const Glyph: React.FC<LogoProps> = ({ size = 32, accent }) => {
  const a = accent || 'var(--im-accent)'
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <rect x="4" y="4" width="40" height="40" rx="4" fill="var(--im-bg-3)" stroke="var(--im-text-1)" strokeWidth="1.5" />
      <rect x="14" y="7" width="20" height="11" rx="1" fill="var(--im-text-2)" />
      <rect x="22" y="9" width="4" height="6" rx="0.5" fill="var(--im-bg-3)" />
      <rect x="8" y="22" width="32" height="18" rx="1.5" fill="var(--im-bg-1)" />
      <circle cx="24" cy="31" r="6" fill={a} opacity="0.15" />
      <circle cx="24" cy="31" r="6" stroke={a} strokeWidth="1.5" fill="none" />
      <path d="M24 27 L24 35 M20 31 L28 31" stroke={a} strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="24" cy="31" r="1.5" fill={a} />
    </svg>
  )
}

export const Wordmark: React.FC<LogoProps & { mono?: boolean }> = ({ size = 32, accent, mono = false }) => {
  const a = accent || 'var(--im-accent)'
  return (
    <span style={{
      fontFamily: 'var(--im-font-ui)',
      fontWeight: 700,
      fontSize: size,
      letterSpacing: '-0.02em',
      color: 'var(--im-text-1)',
      display: 'inline-flex',
      alignItems: 'baseline',
      gap: 0,
    }}>
      <span>Im</span>
      <span style={{ color: mono ? 'inherit' : a, fontStyle: 'italic' }}>a</span>
      <span>gine</span>
      <span style={{
        width: size * 0.18,
        height: size * 0.18,
        background: a,
        borderRadius: '50%',
        marginLeft: size * 0.08,
        alignSelf: 'center',
        boxShadow: mono ? 'none' : `0 0 ${size * 0.3}px ${a}`,
        display: 'inline-block',
      }} />
    </span>
  )
}

export const Lockup: React.FC<LogoProps & { showTagline?: boolean }> = ({ size = 24, accent, showTagline = true }) => (
  <div style={{ display: 'inline-flex', alignItems: 'center', gap: size * 0.45 }}>
    <Glyph size={size * 1.6} accent={accent} />
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Wordmark size={size} accent={accent} />
      {showTagline && (
        <span style={{
          fontFamily: 'var(--im-font-mono)',
          fontSize: size * 0.36,
          color: 'var(--im-text-3)',
          textTransform: 'uppercase',
          letterSpacing: '0.18em',
        }}>
          Disk Image Engine
        </span>
      )}
    </div>
  </div>
)

export const IconApp: React.FC<LogoProps> = ({ size = 96, accent }) => {
  const a = accent || 'var(--im-accent)'
  return (
    <div style={{
      width: size,
      height: size,
      borderRadius: size * 0.22,
      background: 'linear-gradient(135deg, #2a2832 0%, #15141a 100%)',
      border: '1px solid #00000080',
      boxShadow: `inset 0 1px 0 #ffffff15, 0 ${size * 0.05}px ${size * 0.15}px #00000080`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute',
        inset: 0,
        background: `radial-gradient(circle at 50% 60%, ${a}30, transparent 60%)`,
      }} />
      <Glyph size={size * 0.7} accent={accent} />
    </div>
  )
}

export const WordmarkPixel: React.FC<LogoProps> = ({ size = 32, accent }) => {
  const a = accent || 'var(--im-accent)'
  return (
    <span style={{
      fontFamily: 'var(--im-font-pixel)',
      fontSize: size * 1.4,
      letterSpacing: '0.04em',
      color: 'var(--im-text-1)',
      textShadow: `0 0 8px ${a}40`,
    }}>
      IMAGINE<span style={{ color: a }}>_</span>
    </span>
  )
}
