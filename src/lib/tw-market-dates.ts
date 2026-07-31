/** Taiwan market calendar helpers (calendar weekdays; no full holiday calendar). */

const TW_OFFSET_MS = 8 * 60 * 60 * 1000;

export function nowInTaipei(): Date {
  return new Date(Date.now() + TW_OFFSET_MS);
}

export function formatIsoDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatYmd(d: Date): string {
  return formatIsoDate(d).replace(/-/g, "");
}

/** ROC calendar date used by TPEx: yyy/MM/dd (民國) */
export function formatRocDate(d: Date): string {
  const y = d.getUTCFullYear() - 1911;
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}/${m}/${day}`;
}

export function formatAsOfLabel(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${y}/${m}/${d}`;
}

export function isoToExcelSerial(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  const ms = Date.UTC(y!, m! - 1, d!);
  return Math.round(ms / 86400000 + 25569);
}

/** Recent candidate trading days (weekdays only), most recent first. */
export function recentWeekdays(count = 12): Date[] {
  const out: Date[] = [];
  const tw = nowInTaipei();
  const cur = new Date(
    Date.UTC(tw.getUTCFullYear(), tw.getUTCMonth(), tw.getUTCDate()),
  );
  // Before ~14:00 TW, prefer previous day as "latest settle" candidate first
  const hour = tw.getUTCHours();
  if (hour < 14) {
    cur.setUTCDate(cur.getUTCDate() - 1);
  }
  let guard = 0;
  while (out.length < count && guard < 40) {
    const wd = cur.getUTCDay(); // 0 Sun … 6 Sat in UTC-shifted TW calendar
    if (wd !== 0 && wd !== 6) {
      out.push(new Date(cur));
    }
    cur.setUTCDate(cur.getUTCDate() - 1);
    guard += 1;
  }
  return out;
}

export function parseYmdToIso(ymd: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd;
  if (/^\d{8}$/.test(ymd)) {
    return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
  }
  throw new Error(`invalid date: ${ymd}`);
}
