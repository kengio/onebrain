// Field regex: supports digits, `*`, ranges (`-`), and lists (`,`). Step syntax (`*/N`) is not supported.
const CRON_FIELD_RE = /^[\d*,\-/]+$/;

export function validateCron(cron: string): { valid: boolean; reason?: string } {
  const fields = cron.trim().split(/\s+/);
  if (fields.length !== 5) {
    return { valid: false, reason: `expected 5 fields, got ${fields.length}` };
  }
  for (const f of fields) {
    if (!CRON_FIELD_RE.test(f)) {
      return { valid: false, reason: `invalid field syntax: "${f}"` };
    }
  }
  return { valid: true };
}

/** Convert a 5-field cron string to a launchd `StartCalendarInterval` dict. Assumes `cron` already passed `validateCron`. */
export function cronFieldsToLaunchd(cron: string): {
  Minute?: number;
  Hour?: number;
  Day?: number;
  Month?: number;
  Weekday?: number;
} {
  const [m, h, dom, mon, dow] = cron.trim().split(/\s+/) as [
    string,
    string,
    string,
    string,
    string,
  ];
  const out: { Minute?: number; Hour?: number; Day?: number; Month?: number; Weekday?: number } =
    {};
  if (m !== '*') out.Minute = Number.parseInt(m, 10);
  if (h !== '*') out.Hour = Number.parseInt(h, 10);
  if (dom !== '*') out.Day = Number.parseInt(dom, 10);
  if (mon !== '*') out.Month = Number.parseInt(mon, 10);
  if (dow !== '*') out.Weekday = Number.parseInt(dow, 10);
  return out;
}

const AT_RE = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/;

export function validateAt(at: string): { valid: boolean; reason?: string } {
  const m = at.match(AT_RE);
  if (!m) {
    return { valid: false, reason: `expected 'YYYY-MM-DD HH:MM', got "${at}"` };
  }
  const [, , mo, d, h, mi] = m as [string, string, string, string, string, string];
  const month = Number.parseInt(mo, 10);
  const day = Number.parseInt(d, 10);
  const hour = Number.parseInt(h, 10);
  const minute = Number.parseInt(mi, 10);
  if (month < 1 || month > 12) return { valid: false, reason: `month out of range: ${month}` };
  if (day < 1 || day > 31) return { valid: false, reason: `day out of range: ${day}` };
  if (hour > 23) return { valid: false, reason: `hour out of range: ${hour}` };
  if (minute > 59) return { valid: false, reason: `minute out of range: ${minute}` };
  return { valid: true };
}

/** Convert a one-shot 'YYYY-MM-DD HH:MM' to a launchd `StartCalendarInterval` dict. Assumes input passed `validateAt`. */
export function atToLaunchd(at: string): {
  Year: number;
  Month: number;
  Day: number;
  Hour: number;
  Minute: number;
} {
  const m = at.match(AT_RE);
  if (!m) throw new Error(`atToLaunchd called with unvalidated input: ${at}`);
  const [, y, mo, d, h, mi] = m as [string, string, string, string, string, string];
  return {
    Year: Number.parseInt(y, 10),
    Month: Number.parseInt(mo, 10),
    Day: Number.parseInt(d, 10),
    Hour: Number.parseInt(h, 10),
    Minute: Number.parseInt(mi, 10),
  };
}
