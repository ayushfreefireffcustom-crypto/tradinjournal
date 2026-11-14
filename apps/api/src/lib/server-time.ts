// MT5 trade-server time ⇄ real UTC.
//
// The MetaTrader5 Python API returns deal / bar times as "seconds since epoch"
// but in the trade server's own wall clock (e.g. GMT+2 in winter, GMT+3 in
// summer for most "New York close" brokers, Elefin and XM included), not UTC.
// Treating those numbers as UTC shifts every deal by the server offset, which
// breaks session / hour-of-day analytics.
//
// A server's clock is modelled as an IANA zone plus a fixed shift:
//   New York close (GMT+2/+3, US DST dates) → America/New_York + 7h  (server 00:00 = NY 17:00)
//   EET/EEST (GMT+2/+3, EU DST dates)       → Europe/Athens + 0
//   fixed GMT+N                             → UTC + N
// The model is picked from an observed offset (bridge: newest quote time vs real
// UTC) and only replaced after a contradicting observation is seen twice.

export interface ServerTz {
  zone: string;
  shiftMin: number;
}

/** What the bridge reports alongside deals: newest quote time (server wall clock) and its own UTC clock, both epoch seconds. */
export interface ServerClock {
  serverTime: number | null;
  utcNow: number;
}

const MIN_MS = 60_000;
const DAY_MS = 86_400_000;
/** Real-world offsets are multiples of 15 minutes. */
const OFFSET_STEP_MIN = 15;
/**
 * The bridge only reports a server time when quotes were seen advancing during
 * the call, so the newest quote is seconds old; allow a little slack for the
 * time between reading it and reading the clock, and for clock skew.
 */
const MAX_QUOTE_LAG_S = 120;
const MAX_CLOCK_LEAD_S = 60;

const NY_CLOSE: ServerTz = { zone: 'America/New_York', shiftMin: 7 * 60 };
const EET: ServerTz = { zone: 'Europe/Athens', shiftMin: 0 };

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(zone: string): Intl.DateTimeFormat {
  let f = formatters.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: zone, hourCycle: 'h23',
      year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
    });
    formatters.set(zone, f);
  }
  return f;
}

/** The zone's UTC offset in minutes at a real instant. */
export function zoneOffsetMin(zone: string, utcMs: number): number {
  if (zone === 'UTC') return 0;
  const p: Record<string, number> = {};
  for (const part of formatter(zone).formatToParts(new Date(utcMs))) {
    if (part.type !== 'literal') p[part.type] = Number(part.value);
  }
  const wall = Date.UTC(p.year!, p.month! - 1, p.day!, p.hour!, p.minute!, p.second!);
  return Math.round((wall - Math.floor(utcMs / 1000) * 1000) / MIN_MS);
}

/** The server's UTC offset (minutes) at a real instant. */
export function serverOffsetAt(tz: ServerTz, utcMs: number): number {
  return zoneOffsetMin(tz.zone, utcMs) + tz.shiftMin;
}

/**
 * The offset (minutes) to subtract from a server-wall-clock epoch value to get
 * real UTC. Around a fall-back transition a wall time occurs twice; the earlier
 * instant wins (FX is closed then, so it only matters for weekend crypto).
 */
export function serverWallOffset(tz: ServerTz, wallMs: number): number {
  // Transitions are far apart, so the offsets a day either side cover both readings.
  const before = serverOffsetAt(tz, wallMs - DAY_MS);
  const candidates = new Set([before, serverOffsetAt(tz, wallMs), serverOffsetAt(tz, wallMs + DAY_MS)]);
  let best: { utc: number; off: number } | null = null;
  for (const off of candidates) {
    const utc = wallMs - off * MIN_MS;
    if (serverOffsetAt(tz, utc) !== off) continue; // this reading doesn't round-trip
    if (!best || utc < best.utc) best = { utc, off };
  }
  // A wall time inside a spring-forward gap never existed; use the pre-gap offset.
  return best ? best.off : before;
}

/** Server wall-clock epoch ms → real UTC epoch ms. */
export function serverWallToUtc(tz: ServerTz, wallMs: number): number {
  return wallMs - serverWallOffset(tz, wallMs) * MIN_MS;
}

/** Real UTC epoch ms → server wall-clock epoch ms (for bridge query ranges). */
export function utcToServerWall(tz: ServerTz, utcMs: number): number {
  return utcMs + serverOffsetAt(tz, utcMs) * MIN_MS;
}

/**
 * The server's current offset in minutes from one bridge clock reading, or null
 * when it can't be trusted. The bridge sends null itself unless quotes moved
 * during the call (weekends, holidays, a just-connected terminal).
 */
export function observeOffset(clock: ServerClock | null | undefined): number | null {
  if (!clock || clock.serverTime == null || !Number.isFinite(clock.serverTime) || !Number.isFinite(clock.utcNow)) return null;
  const diffS = clock.serverTime - clock.utcNow;
  const stepS = OFFSET_STEP_MIN * 60;
  const offsetS = Math.round(diffS / stepS) * stepS;
  const lag = offsetS - diffS; // > 0: the quote trails the server clock
  if (lag > MAX_QUOTE_LAG_S || lag < -MAX_CLOCK_LEAD_S) return null;
  if (Math.abs(offsetS) > 14 * 3600) return null;
  return offsetS / 60 || 0; // never -0
}

/** Models consistent with a server showing `offsetMin` at `utcMs`, most likely first. */
export function candidateZones(offsetMin: number, utcMs: number): ServerTz[] {
  const named = [NY_CLOSE, EET].filter(tz => serverOffsetAt(tz, utcMs) === offsetMin);
  return [...named, { zone: 'UTC', shiftMin: offsetMin }];
}

export const sameTz = (a: ServerTz | null | undefined, b: ServerTz | null | undefined) =>
  !!a && !!b && a.zone === b.zone && a.shiftMin === b.shiftMin;

export interface TzState {
  tz: ServerTz | null;
  /** The latest reading, and when the current run of identical readings began (epoch ms). */
  lastObservedMin: number | null;
  lastObservedAt: number | null;
}

/**
 * A reading only counts once repeated this long after the run began. A live
 * clock gives the same reading minutes later; a stale quote (e.g. Friday's close
 * coming in after a weekend login) drifts with real time, and the bridge's
 * ±2-minute acceptance window can't hold the same value across 5 minutes.
 */
export const CONFIRM_AFTER_MS = 5 * 60_000;

/**
 * Fold one observation into an account's model. Setting the first model or
 * replacing one both need a confirmed reading (same value, ≥ CONFIRM_AFTER_MS
 * apart), so one odd quote can never rewrite an account's history.
 */
export function updateServerTz(state: TzState, observedMin: number | null, utcMs: number): TzState & { changed: boolean } {
  if (observedMin == null) return { ...state, changed: false };
  const { tz, lastObservedMin, lastObservedAt } = state;
  const sameRun = lastObservedMin === observedMin && lastObservedAt != null && lastObservedAt <= utcMs;
  const next: TzState = { tz, lastObservedMin: observedMin, lastObservedAt: sameRun ? lastObservedAt : utcMs };
  if (tz && serverOffsetAt(tz, utcMs) === observedMin) return { ...next, changed: false };
  if (!sameRun || utcMs - lastObservedAt! < CONFIRM_AFTER_MS) return { ...next, changed: false };
  const pick = candidateZones(observedMin, utcMs).find(c => !sameTz(c, tz))!;
  return { ...next, tz: pick, changed: true };
}

/** Stored columns → model. */
export function tzOf(a: { serverTimeZone: string | null; serverTimeShiftMin: number | null }): ServerTz | null {
  return a.serverTimeZone ? { zone: a.serverTimeZone, shiftMin: a.serverTimeShiftMin ?? 0 } : null;
}

/** Parse "America/New_York+420" / "UTC+120" / "Europe/Athens" (CLI overrides). */
export function parseTz(spec: string): ServerTz {
  const m = /^([A-Za-z_/]+?)([+-]\d+)?$/.exec(spec.trim());
  if (!m) throw new Error(`Bad server time zone "${spec}" — use e.g. America/New_York+420 or UTC+120`);
  const tz = { zone: m[1]!, shiftMin: m[2] ? Number(m[2]) : 0 };
  zoneOffsetMin(tz.zone, Date.now()); // throws RangeError on an unknown zone
  return tz;
}

export const formatTz = (tz: ServerTz) => `${tz.zone}${tz.shiftMin ? (tz.shiftMin > 0 ? '+' : '') + tz.shiftMin : ''}`;
