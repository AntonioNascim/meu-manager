import type { ReactNode } from 'react'

export type IconName = 'home' | 'squad' | 'tactics' | 'market' | 'table' | 'finance' | 'contract' | 'calendar' | 'heart' | 'ball' | 'stadium' | 'trophy' | 'swap' | 'filter' | 'star' | 'boot' | 'card' | 'lineup' | 'sprout' | 'dumbbell' | 'history' | 'users' | 'gear' | 'wallet' | 'cal' | 'user' | 'chart' | 'shirt' | 'news' | 'play' | 'pause' | 'ffwd' | 'chev' | 'left' | 'down' | 'up' | 'check' | 'x' | 'plus' | 'search' | 'cloud' | 'folder' | 'down2' | 'up2' | 'eye' | 'bell' | 'alert' | 'clip' | 'dollar' | 'dumb' | 'doc' | 'hist' | 'med' | 'lock' | 'share' | 'copy' | 'trash' | 'flag' | 'shield' | 'sliders' | 'info' | 'clock' | 'mail' | 'link' | 'send' | 'stad' | 'sort' | 'menu' | 'whistle' | 'globe' | 'crown' | 'key' | 'edit' | 'grid' | 'undo' | 'redo' | 'target' | 'hand'

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
  users: <><circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6"/><circle cx="17" cy="9" r="2.5"/><path d="M17 14c2.5 0 4 1.8 4 4.5"/></>,
  gear: <><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/></>,
  wallet: <><path d="M3 7a2 2 0 0 1 2-2h13v4"/><path d="M3 7v11a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2z"/><circle cx="16" cy="14.5" r="1.3"/></>,
  cal: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></>,
  user: <><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.5 3.5-7 8-7s8 2.5 8 7"/></>,
  chart: <><path d="M4 20V11M10 20V4M16 20v-7M22 20H2"/></>,
  shirt: <><path d="M8 3L3 6l2 5 3-1v11h8V10l3 1 2-5-5-3c-1 2-2 3-4 3S9 5 8 3z"/></>,
  news: <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9h6M7 13h10M7 16h10"/></>,
  play: <><path d="M7 4l13 8-13 8z"/></>,
  pause: <><path d="M7 4h4v16H7zM13 4h4v16h-4z"/></>,
  ffwd: <><path d="M4 5l8 7-8 7zM12 5l8 7-8 7z"/></>,
  chev: <><path d="M9 5l7 7-7 7"/></>,
  left: <><path d="M15 5l-7 7 7 7"/></>,
  down: <><path d="M5 9l7 7 7-7"/></>,
  up: <><path d="M5 15l7-7 7 7"/></>,
  check: <><path d="M4 12l5 5L20 6"/></>,
  x: <><path d="M5 5l14 14M19 5L5 19"/></>,
  plus: <><path d="M12 4v16M4 12h16"/></>,
  search: <><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></>,
  cloud: <><path d="M7 18a4 4 0 0 1-.5-8A6 6 0 0 1 18 11a3.5 3.5 0 0 1 0 7z"/></>,
  folder: <><path d="M3 6a2 2 0 0 1 2-2h4l2 3h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></>,
  down2: <><path d="M12 4v11M7 11l5 5 5-5M4 20h16"/></>,
  up2: <><path d="M12 16V5M7 9l5-5 5 5M4 20h16"/></>,
  eye: <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></>,
  bell: <><path d="M6 17V11a6 6 0 0 1 12 0v6l2 2H4z"/><path d="M10 21h4"/></>,
  alert: <><path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.5"/></>,
  clip: <><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 10l3 3M12 10l-3 3M9 17h6"/></>,
  dollar: <><circle cx="12" cy="12" r="9"/><path d="M12 6v12M9.5 9c0-1.2 1.2-2 2.5-2s2.5.8 2.5 2c0 3-5 1.5-5 4.5 0 1.2 1.2 2 2.5 2s2.5-.8 2.5-2"/></>,
  dumb: <><path d="M6 8v8M3 10v4M18 8v8M21 10v4M6 12h12"/></>,
  doc: <><path d="M6 3h9l4 4v14H6z"/><path d="M9 12h7M9 16h5"/></>,
  hist: <><path d="M4 12a8 8 0 1 0 3-6.2"/><path d="M4 4v4h4M12 8v4l3 2"/></>,
  med: <><path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"/></>,
  lock: <><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></>,
  share: <><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.2 11l7.6-4M8.2 13l7.6 4"/></>,
  copy: <><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></>,
  trash: <><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></>,
  flag: <><path d="M5 21V4M5 4h12l-2 4 2 4H5"/></>,
  shield: <><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/></>,
  sliders: <><path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/></>,
  info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/></>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 7 9-7"/></>,
  link: <><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></>,
  send: <><path d="M21 3L10 14M21 3l-7 18-4-7-7-4z"/></>,
  stad: <><ellipse cx="12" cy="9" rx="9" ry="4"/><path d="M3 9v6c0 2.2 4 4 9 4s9-1.8 9-4V9M3 12c0 2.2 4 4 9 4s9-1.8 9-4"/></>,
  sort: <><path d="M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3"/></>,
  menu: <><path d="M4 6h16M4 12h16M4 18h16"/></>,
  whistle: <><circle cx="9" cy="14" r="5"/><path d="M13 11l8-4v4l-6 2M9 10V8"/></>,
  globe: <><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/></>,
  crown: <><path d="M3 8l4 4 5-7 5 7 4-4-2 11H5z"/></>,
  key: <><circle cx="8" cy="14" r="4"/><path d="M11 11l9-8M16 6l3 3"/></>,
  edit: <><path d="M4 20h4L19 9l-4-4L4 16z"/></>,
  grid: <><rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/></>,
  undo: <><path d="M9 7L4 12l5 5M4 12h11a5 5 0 0 1 0 10"/></>,
  redo: <><path d="M15 7l5 5-5 5M20 12H9a5 5 0 0 0 0 10"/></>,
  target: <><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></>,
  hand: <><path d="M7 11V6a1.5 1.5 0 0 1 3 0v4M10 10V4.5a1.5 1.5 0 0 1 3 0V10M13 10V5.5a1.5 1.5 0 0 1 3 0V12M16 9a1.5 1.5 0 0 1 3 0v5c0 4-2 7-6 7-3 0-4-1.5-6-4l-2-3 1.5-1L7 15"/></>,
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
