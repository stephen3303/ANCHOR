const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

const pad = (n: number) => String(n).padStart(2, "0");

/** Explicit military date/time for new manual datetime inputs. */
export const ZULU_DATETIME_PATTERN = "^(0[1-9]|[12][0-9]|3[01]) (JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC) [0-9]{4} ([01][0-9]|2[0-3])[0-5][0-9]Z$";

/** Naval date-time group, e.g. 241830Z OCT 26. */
export function fmtDTG(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return `${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}Z ${MONTHS[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(-2)}`;
}

/** "24 OCT 2026" in UTC, the date format used across naval traffic. */
export function fmtDate(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return `${pad(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "1830Z" */
export function fmtTime(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return `${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}Z`;
}

/** "24 OCT 2026 1830Z" */
export function fmtDateTime(iso: string | Date): string {
  return `${fmtDate(iso)} ${fmtTime(iso)}`;
}

/** Short hash for display: first 6 and last 4 characters. */
export function shortHash(h: string): string {
  return `${h.slice(0, 6)}…${h.slice(-4)}`;
}

/** Mock "now" so relative times line up with the mock data. */
export const MOCK_NOW = new Date("2026-10-24T19:00:00Z");

export function hoursAgo(iso: string): string {
  const h = Math.round((MOCK_NOW.getTime() - new Date(iso).getTime()) / 3_600_000);
  if (h < 1) return "just now";
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function hoursUntil(iso: string): number {
  return Math.round((new Date(iso).getTime() - MOCK_NOW.getTime()) / 3_600_000);
}
