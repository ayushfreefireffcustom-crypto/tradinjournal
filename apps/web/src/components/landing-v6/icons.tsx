// One line-glyph family for the whole landing: a hidden sprite plus <Ic>.
// Glyphs sit inside the glossy icon tiles, chips and buttons.

const GLYPHS = {
  book: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z" /><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20" /><path d="M9 8h7M9 12h5" /></>,
  play: <><circle cx="12" cy="12" r="9" /><path d="M10 8.5v7l6-3.5z" /></>,
  tag: <><path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z" /><circle cx="7.5" cy="7.5" r="1.5" /></>,
  layers: <><path d="M12 3 3 8l9 5 9-5z" /><path d="m3 13 9 5 9-5" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  cal: <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  bars: <path d="M5 20V11M12 20V4M19 20v-6" />,
  curve: <><path d="M3 17l5-5 4 3 9-9" /><path d="M15 6h6v6" /></>,
  chat: <><path d="M4 5h16v11H9l-5 4z" /><path d="M8 9h8M8 12h5" /></>,
  signal: <><circle cx="12" cy="12" r="2.5" /><path d="M7.5 7.5a6.4 6.4 0 0 0 0 9M16.5 7.5a6.4 6.4 0 0 1 0 9M4.6 4.6a10.5 10.5 0 0 0 0 14.8M19.4 4.6a10.5 10.5 0 0 1 0 14.8" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="3" /><path d="m4 7 8 6 8-6" /></>,
  bulb: <><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.4 1 1.1 1 1.8V16h5v-.3c0-.7.4-1.4 1-1.8A6 6 0 0 0 12 3z" /></>,
  flame: <path d="M12 21c4 0 7-2.7 7-6.6 0-3.3-2.2-5.4-3.7-7-.4 1.9-1.4 3-2.6 3.6.3-2.6-.6-5.7-3.2-8C9.7 6 5 8.8 5 14.4 5 18.3 8 21 12 21z" />,
  gauge: <><path d="M4.5 18a9 9 0 1 1 15 0" /><path d="m12 13 4-4" /><circle cx="12" cy="13" r="1.4" /></>,
  list: <><path d="m4 6 1.5 1.5L8 5M4 12l1.5 1.5L8 11M4 18l1.5 1.5L8 17" /><path d="M11 6h9M11 12h9M11 18h9" /></>,
  pause: <><circle cx="12" cy="12" r="9" /><path d="M10 9v6M14 9v6" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.6 2.8 2.6 15.2 0 18M12 3c-2.6 2.8-2.6 15.2 0 18" /></>,
  news: <><rect x="3" y="4" width="15" height="16" rx="2" /><path d="M18 8h3v10a2 2 0 0 1-2 2" /><path d="M7 8h7M7 12h7M7 16h4" /></>,
  bell: <><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" /><path d="M10 21h4" /></>,
  pulse: <path d="M3 12h4l2.5-6 4 12 2.5-6H21" />,
  lock: <><rect x="4.5" y="10.5" width="15" height="10" rx="2.5" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /><path d="M12 14.5v2" /></>,
  eye: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="2.8" /></>,
  plug: <><path d="M9 3v5M15 3v5M7 8h10v3a5 5 0 0 1-10 0z" /><path d="M12 16v5" /></>,
  unlink: <><path d="M9.5 14.5 14.5 9.5" /><path d="M8 11 5.5 13.5a3.5 3.5 0 0 0 5 5L13 16M16 13l2.5-2.5a3.5 3.5 0 0 0-5-5L11 8" /></>,
  copy: <><rect x="8" y="8" width="12" height="12" rx="2.5" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></>,
  blocks: <><rect x="3" y="3" width="8" height="8" rx="2" /><rect x="13" y="13" width="8" height="8" rx="2" /><path d="M15 3h6v6M3 15v6h6" /></>,
  key: <><circle cx="8" cy="15" r="4" /><path d="m11 12 9-9M17 6l3 3M14.5 8.5l2 2" /></>,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  card: <><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M3 10h18" /><path d="m5 3 14 18" /></>,
  shield: <><path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.2 7.5 9.5 4.3-1.3 7.5-4.9 7.5-9.5V6z" /><path d="m9 12 2 2 4-4" /></>,
} as const;

export type IconName = keyof typeof GLYPHS;

export function IconSprite() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden focusable="false">
      <defs>
        {Object.entries(GLYPHS).map(([k, g]) => (
          <symbol key={k} id={`lp6-${k}`} viewBox="0 0 24 24">{g}</symbol>
        ))}
      </defs>
    </svg>
  );
}

export function Ic({ name, size, stroke = 2, className, style }: { name: IconName; size?: number; stroke?: number; className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={`ic ${className ?? ''}`} viewBox="0 0 24 24" width={size} height={size} strokeWidth={stroke} aria-hidden focusable="false" style={style}>
      <use href={`#lp6-${name}`} />
    </svg>
  );
}
