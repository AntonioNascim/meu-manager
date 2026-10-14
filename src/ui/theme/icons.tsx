import type { ReactNode } from 'react'

export type IconName = 'home' | 'squad' | 'tactics' | 'market' | 'table' | 'finance' | 'contract' | 'calendar' | 'heart' | 'ball' | 'stadium' | 'trophy' | 'swap' | 'filter' | 'star' | 'boot' | 'card' | 'lineup' | 'sprout' | 'dumbbell' | 'history'

const PATHS: Record<IconName, ReactNode> = {
  home: <path d="M3 11.5 12 4l9 7.5M5.5 10v10h13V10M10 20v-6h4v6" />,
  squad: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 20c0-3.6 2.7-6 6-6s6 2.4 6 6M16 5.2a3 3 0 0 1 0 5.6M17.5 14.3c2.2.6 3.5 2.6 3.5 5.7" />
    </>
  ),
  tactics: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M12 5v14M3 12h3M18 12h3" />
      <circle cx="12" cy="12" r="2.5" />
    </>
  ),
  market: <path d="M4 8h13l3 4-3 4H4M4 8l3 4-3 4M9 12h5" />,
  table: <path d="M7 4h10v5a5 5 0 0 1-10 0V4ZM7 6H4v1.5A3.5 3.5 0 0 0 7 11M17 6h3v1.5a3.5 3.5 0 0 1-3 3.5M12 14v3.5M8.5 20h7M9.5 17.5h5" />,
  finance: (
    <>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.6" />
      <path d="M6.5 9.5v.01M17.5 14.5v.01" />
    </>
  ),
  contract: (
    <>
      <path d="M6 3h8l4 4v14H6V3Z" />
      <path d="M14 3v4h4M9 12h6M9 16h4" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15" rx="2" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </>
  ),
  heart: <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" />,
  ball: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m12 8 3.5 2.5-1.3 4h-4.4l-1.3-4L12 8ZM12 3.5V8M15.5 10.5l4.5-1.2M14.2 14.5l2.8 3.6M9.8 14.5 7 18.1M8.5 10.5 4 9.3" />
    </>
  ),
  stadium: <path d="M3 10c0-2 4-3.5 9-3.5s9 1.5 9 3.5v5c0 2-4 3.5-9 3.5S3 17 3 15v-5ZM3 10c0 2 4 3.5 9 3.5s9-1.5 9-3.5M7 13.8v4M12 14v4.5M17 13.8v4" />,
  trophy: <path d="M7 4h10v5a5 5 0 0 1-10 0V4ZM7 6H4v1.5A3.5 3.5 0 0 0 7 11M17 6h3v1.5a3.5 3.5 0 0 1-3 3.5M12 14v3.5M8.5 20h7" />,
  swap: <path d="M4 8h14l-3-3M20 16H6l3 3" />,
  boot: <path d="M3 15c3 0 5-2 6-5l2-4 3 1 1 3 5 2c1.5.6 2 1.4 2 2.5V18H3v-3ZM3 18h18M10 10l2 1M13 11l2 1" />,
  card: (
    <>
      <rect x="6" y="3.5" width="12" height="17" rx="2" />
      <path d="M9 8h6" />
    </>
  ),
  lineup: (
    <>
      <rect x="4" y="3.5" width="16" height="17" rx="2" />
      <path d="M9 8.5h.01M15 8.5h.01M12 12h.01M8.5 15.5h.01M15.5 15.5h.01M4 12h3M17 12h3" />
    </>
  ),
  sprout: <path d="M12 20v-8M12 12c0-3.5-2.5-5.5-6-5.5 0 3.5 2.5 5.5 6 5.5ZM12 14c0-3 2.2-5 5.5-5 0 3-2.2 5-5.5 5ZM8 20h8" />,
  dumbbell: <path d="M2.5 9.5v5M5.5 7v10M18.5 7v10M21.5 9.5v5M5.5 12h13" />,
  history: (
    <>
      <path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4.5h4.5" />
      <path d="M12 8v4.2l2.8 1.8" />
    </>
  ),
  filter: <path d="M4 7h16M7 12h10M10 17h4" />,
  star: <path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.9L12 3.5Z" />,
}

/** Ícone de traço (estilo de contorno), na cor do texto ao redor. */
export function Icon({ name, size = 22, className = '' }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
    >
      {PATHS[name]}
    </svg>
  )
}
