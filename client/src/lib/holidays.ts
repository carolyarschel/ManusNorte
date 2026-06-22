/** Brazilian national holidays (fixed dates) */
const FIXED: [number, number][] = [
  [1, 1],   // Ano Novo
  [4, 21],  // Tiradentes
  [5, 1],   // Dia do Trabalho
  [9, 7],   // Independência
  [10, 12], // N.Sra. Aparecida
  [11, 2],  // Finados
  [11, 15], // Proclamação da República
  [12, 25], // Natal
];

/** Computus algorithm for Easter Sunday */
function easter(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function toKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const cache = new Map<number, Set<string>>();

function holidaysForYear(year: number): Set<string> {
  if (cache.has(year)) return cache.get(year)!;
  const set = new Set<string>();
  for (const [m, d] of FIXED) set.add(`${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  const e = easter(year);
  set.add(toKey(addDays(e, -48))); // Carnaval segunda
  set.add(toKey(addDays(e, -47))); // Carnaval terça
  set.add(toKey(addDays(e, -2)));  // Sexta-feira Santa
  set.add(toKey(addDays(e, 60)));  // Corpus Christi
  cache.set(year, set);
  return set;
}

export function isHoliday(date: Date): boolean {
  return holidaysForYear(date.getFullYear()).has(toKey(date));
}

export function isWorkingDay(date: Date): boolean {
  const dow = date.getDay(); // 0=Sun, 6=Sat
  if (dow === 0 || dow === 6) return false;
  return !isHoliday(date);
}

export function nextWorkingDay(from: Date): Date {
  const d = new Date(from);
  d.setDate(d.getDate() + 1);
  while (!isWorkingDay(d)) d.setDate(d.getDate() + 1);
  return d;
}
