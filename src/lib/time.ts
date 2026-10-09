/** Offset (minutes) of a time zone from UTC at an instant. */
function offsetMinutes(ms: number, timeZone: string) {
  const p = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(ms));
  const g = (k: string) => Number(p.find((x) => x.type === k)!.value);
  return (Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second")) - ms) / 60000;
}

/** "YYYY-MM-DDTHH:mm[:ss]" or "YYYY-MM-DD" as wall-clock time in `timeZone` → the UTC instant. */
export function zonedToUtc(local: string, timeZone: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(local.trim());
  if (!m) return null;
  const guess = Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
  let utc = guess - offsetMinutes(guess, timeZone) * 60000;
  utc = guess - offsetMinutes(utc, timeZone) * 60000; // second pass across DST changes
  return new Date(utc);
}

/** UTC instant → "YYYY-MM-DDTHH:mm" in `timeZone` (for datetime-local inputs). */
export function utcToZonedInput(d: Date | null | undefined, timeZone: string) {
  if (!d) return "";
  const p = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d);
  const g = (k: string) => p.find((x) => x.type === k)!.value;
  return `${g("year")}-${g("month")}-${g("day")}T${g("hour")}:${g("minute")}`;
}
