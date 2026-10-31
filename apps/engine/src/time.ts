// Day boundaries in a user's time zone, for the daily loss limit (C1.9).

/** The instant local midnight began in `tz` (IANA name). Falls back to UTC for an unknown zone. */
export function dayStartIn(tz: string, now: Date): Date {
  try {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
        .formatToParts(now)
        .map((p) => [p.type, Number(p.value)]),
    ) as Record<string, number>;
    const wallAsUtc = Date.UTC(parts.year!, parts.month! - 1, parts.day!, parts.hour!, parts.minute!, parts.second!);
    const offset = wallAsUtc - Math.floor(now.getTime() / 1000) * 1000;
    let start = Date.UTC(parts.year!, parts.month! - 1, parts.day!) - offset;
    // A DST change during the day moves midnight's offset; never return a future instant.
    if (start > now.getTime()) start -= 3600_000;
    return new Date(start);
  } catch {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }
}
