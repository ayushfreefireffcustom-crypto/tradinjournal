// v3 icon set — 24px grid, 1.7 stroke, round caps. One family across the app.
import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };
const base = (size = 17) => ({
  width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
  strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true,
});
const mk = (paths: React.ReactNode) => function Icon({ size, ...rest }: P) { return <svg {...base(size)} {...rest}>{paths}</svg>; };

export const IDashboard = mk(<><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></>);
export const ITradeLog = mk(<path d="M4 6h16M4 12h16M4 18h10" />);
export const IAnalytics = mk(<path d="M3 20h18M6 16v-5M11 16V7M16 16v-8M21 16V4" />);
export const ICalendar = mk(<><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>);
export const IReplay = mk(<><path d="M4 5v14h16" /><path d="M8 14l3-4 3 2 5-6" /></>);
export const IJournal = mk(<><path d="M5 4h11l3 3v13H5z" /><path d="M9 10h6M9 14h6" /></>);
export const ICharts = mk(<path d="M7 4v16M17 4v16M4 9h6M14 14h6" />);
export const IMarkets = mk(<><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M8 9h8M8 13h8M8 17h5" /></>);
export const IMacro = mk(<><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18" /></>);
export const ISignalX = mk(<><circle cx="12" cy="12" r="8" /><path d="M12 2v4M12 18v4M2 12h4M18 12h4" /></>);
export const ICoach = mk(<path d="M4 5h16v11H9l-5 4z" />);
export const IBrokers = mk(<path d="M3 10l9-6 9 6M5 10v9h14v-9M9 19v-5h6v5" />);
export const ISettings = mk(<><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" /></>);
export const IAdmin = mk(<><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /><path d="M9 12l2 2 4-4" /></>);
export const ISearch = mk(<><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></>);
export const IBell = mk(<><path d="M6 16V11a6 6 0 0112 0v5l2 2H4z" /><path d="M10 20a2 2 0 004 0" /></>);
export const ISync = mk(<path d="M20 11a8 8 0 00-14.9-3M4 13a8 8 0 0014.9 3M4 4v4h4M20 20v-4h-4" />);
export const IPlus = mk(<path d="M12 5v14M5 12h14" />);
export const IArrowRight = mk(<path d="M5 12h14M13 6l6 6-6 6" />);
export const IArrowLeft = mk(<path d="M19 12H5M11 6l-6 6 6 6" />);
export const IChevrons = mk(<path d="M8 9l4-4 4 4M8 15l4 4 4-4" />);
export const IChevronDown = mk(<path d="M6 9l6 6 6-6" />);
export const IMenu = mk(<path d="M4 7h16M4 12h16M4 17h16" />);
export const IClose = mk(<path d="M6 6l12 12M18 6L6 18" />);
export const ICheck = mk(<path d="M5 12.5l4.5 4.5L19 7.5" />);
export const IAlert = mk(<><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 17h.01" /></>);
export const IWarn = mk(<><path d="M12 3l9 16H3z" /><path d="M12 10v4M12 17h.01" /></>);
export const ITrendUp = mk(<path d="M4 16l5-5 4 4 7-7M15 8h5v5" />);
export const ISun = mk(<><circle cx="12" cy="12" r="4" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></>);
export const IDownload = mk(<path d="M12 4v11M7 10l5 5 5-5M5 20h14" />);
export const ILock = mk(<><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 018 0v3" /></>);
export const IMail = mk(<><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="M3.5 7l8.5 6 8.5-6" /></>);
