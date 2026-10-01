/**
 * Fechas en la zona horaria del proyecto. En BD todo se guarda en UTC; la UI trabaja con
 * "hora de pared" del proyecto (AAAA-MM-DDTHH:mm). Sin dependencias: usa Intl.
 */

const PERIOD_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
const WALL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

export function isValidPeriod(period: string): boolean {
  return PERIOD_RE.test(period);
}

type Parts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

export function zonedParts(date: Date, timeZone: string): Parts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const p = Object.fromEntries(fmt.formatToParts(date).map((x) => [x.type, x.value]));
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour),
    minute: Number(p.minute),
    second: Number(p.second),
  };
}

function offsetMs(date: Date, timeZone: string): number {
  const p = zonedParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** Convierte "AAAA-MM-DDTHH:mm" en la zona del proyecto a un instante UTC. Devuelve null si no es válida. */
export function wallTimeToUtc(wall: string, timeZone: string): Date | null {
  const m = WALL_RE.exec(wall);
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const naive = Date.UTC(y, mo - 1, d, h, mi);
  const check = new Date(naive);
  if (check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d || h > 23 || mi > 59) return null;
  let result = naive - offsetMs(new Date(naive), timeZone);
  const second = offsetMs(new Date(result), timeZone);
  if (naive - second !== result) result = naive - second; // cambio de hora (DST)
  return new Date(result);
}

const pad = (n: number) => String(n).padStart(2, "0");

export function utcToWallTime(date: Date, timeZone: string): string {
  const p = zonedParts(date, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/** Día (AAAA-MM-DD) del instante en la zona del proyecto. */
export function zonedDay(date: Date, timeZone: string): string {
  return utcToWallTime(date, timeZone).slice(0, 10);
}

export function periodOfWallTime(wall: string): string {
  return wall.slice(0, 7);
}

/** Semanas del mes (lunes a domingo); los huecos fuera del mes son null. */
export function monthGrid(period: string): (string | null)[][] {
  const m = PERIOD_RE.exec(period);
  if (!m) throw new Error(`Periodo no válido: ${period}`);
  const year = Number(m[1]);
  const month = Number(m[2]);
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const firstWeekday = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7; // lunes = 0
  const cells: (string | null)[] = Array(firstWeekday).fill(null);
  for (let d = 1; d <= days; d++) cells.push(`${period}-${pad(d)}`);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export function formatPeriod(period: string, locale = "es-ES"): string {
  const m = PERIOD_RE.exec(period);
  if (!m) return period;
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1));
  const text = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(date);
  return text.charAt(0).toLocaleUpperCase(locale) + text.slice(1);
}

/** Mes siguiente al instante dado, en la zona del proyecto (para proponer el próximo ciclo). */
export function nextPeriod(now: Date, timeZone: string): string {
  const p = zonedParts(now, timeZone);
  const y = p.month === 12 ? p.year + 1 : p.year;
  const mo = p.month === 12 ? 1 : p.month + 1;
  return `${y}-${pad(mo)}`;
}

/** Fecha y hora legibles en la zona del proyecto, p. ej. "lun, 5 oct, 10:00". */
export function formatInZone(date: Date, timeZone: string, locale = "es-ES"): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatTimeInZone(date: Date, timeZone: string, locale = "es-ES"): string {
  return new Intl.DateTimeFormat(locale, { timeZone, hour: "2-digit", minute: "2-digit" }).format(date);
}
