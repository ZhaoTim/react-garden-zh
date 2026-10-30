import { site } from "~/site.config";

const dateFmt = new Intl.DateTimeFormat(site.locale, {
  year: "numeric",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});
const monthFmt = new Intl.DateTimeFormat(site.locale, {
  year: "numeric",
  month: "long",
  timeZone: "UTC",
});

/** "Oct 25, 2026". UTC so server and client render the same string (no hydration mismatch). */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : dateFmt.format(d);
}

/** "October 2026" */
export function formatMonth(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : monthFmt.format(d);
}

/** Machine-readable date for <time dateTime>. */
export function isoDate(iso: string): string {
  return iso.slice(0, 10);
}

export function formatReading(minutes: number): string {
  const m = Math.max(1, Math.round(minutes));
  if (m < 60) return `约 ${m} 分钟阅读`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `约 ${h} 小时 ${r} 分钟` : `约 ${h} 小时`;
}

/** Total duration for a series, e.g. "3 h 20 min". */
export function formatDuration(minutes: number): string {
  const m = Math.max(1, Math.round(minutes));
  if (m < 60) return `${m} 分钟`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} 小时 ${r} 分钟` : `${h} 小时`;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  if (one === "part") return `共 ${n} 篇`;
  return `${n} ${n === 1 ? one : many}`;
}

/** "react-explain" -> "React Explain" */
export function humanize(s: string): string {
  return s
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Two-digit part number: 7 -> "07". */
export function partNumber(n: number): string {
  return String(n).padStart(2, "0");
}
