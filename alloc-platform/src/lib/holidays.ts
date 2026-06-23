/**
 * Brazilian national holidays for a given year.
 * Returns a Set of ISO date strings ("YYYY-MM-DD") that are holidays.
 *
 * Fixed holidays (Lei nº 10.607/2002 and subsequent legislation):
 *   Jan 1  – Confraternização Universal
 *   Apr 21 – Tiradentes
 *   May 1  – Dia do Trabalho
 *   Sep 7  – Independência do Brasil
 *   Oct 12 – Nossa Senhora Aparecida
 *   Nov 2  – Finados
 *   Nov 15 – Proclamação da República
 *   Nov 20 – Consciência Negra (federal since 2024)
 *   Dec 25 – Natal
 *
 * Variable (computed from Easter):
 *   Carnaval: -47 days from Easter (Monday + Tuesday collapsed to the closest weekday)
 *   Sexta-feira Santa: -2 days from Easter
 *   Corpus Christi: +60 days from Easter
 *   Páscoa itself is Sunday — not a working day anyway, but included for completeness
 */
function easterSunday(year: number): Date {
  // Anonymous Gregorian algorithm
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
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1; // 0-indexed
  const day   = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month, day);
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function iso(date: Date): string {
  return date.toISOString().split("T")[0];
}

export function brazilianHolidays(year: number): Set<string> {
  const set = new Set<string>();

  // ── Fixed national holidays ───────────────────────────────────────────────
  const fixed: [number, number][] = [
    [1,  1],  // Confraternização Universal
    [4,  21], // Tiradentes
    [5,  1],  // Dia do Trabalho
    [9,  7],  // Independência
    [10, 12], // Nossa Senhora Aparecida
    [11, 2],  // Finados
    [11, 15], // Proclamação da República
    [11, 20], // Consciência Negra (federal desde 2024)
    [12, 25], // Natal
  ];
  for (const [month, day] of fixed) {
    set.add(iso(new Date(year, month - 1, day)));
  }

  // ── Variable holidays (relative to Easter Sunday) ─────────────────────────
  const easter = easterSunday(year);
  set.add(iso(easter));                    // Páscoa (domingo)
  set.add(iso(addDays(easter, -48)));      // Segunda-feira de Carnaval
  set.add(iso(addDays(easter, -47)));      // Terça-feira de Carnaval
  set.add(iso(addDays(easter, -2)));       // Sexta-feira Santa
  set.add(iso(addDays(easter,  60)));      // Corpus Christi (quinta-feira)

  return set;
}

/** True when `date` is a Brazilian national holiday. */
export function isBrazilianHoliday(date: Date): boolean {
  return brazilianHolidays(date.getFullYear()).has(
    date.toISOString().split("T")[0]
  );
}

/** True when `date` is a working day (Mon–Fri, not a holiday). */
export function isWorkingDay(date: Date): boolean {
  const dow = date.getDay();
  return dow >= 1 && dow <= 5 && !isBrazilianHoliday(date);
}
