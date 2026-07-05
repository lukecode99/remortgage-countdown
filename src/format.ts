// Display formatting — pure, unit-tested.

export const formatPounds = (v: number): string => {
  const rounded = Math.round(v);
  return `£${rounded.toLocaleString('en-GB')}`;
};

export const formatPoundsPence = (v: number): string =>
  `£${v.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const formatPct = (v: number): string =>
  `${(Math.round(v * 100) / 100).toString()}%`;

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2027-03-31" → "31 Mar 2027" */
export const formatDate = (iso: string): string => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS_SHORT[m - 1]} ${y}`;
};

/** Countdown headline: "142 days" / "1 day" / "Deal ended". */
export const formatDays = (days: number): string =>
  days <= 0 ? 'Deal ended' : days === 1 ? '1 day' : `${days.toLocaleString('en-GB')} days`;

/** Secondary countdown line: "4 months, 12 days" (skips zero parts). */
export function formatMonthsDays(months: number, remDays: number): string {
  const parts: string[] = [];
  if (months > 0) parts.push(months === 1 ? '1 month' : `${months} months`);
  if (remDays > 0) parts.push(remDays === 1 ? '1 day' : `${remDays} days`);
  return parts.length ? parts.join(', ') : 'less than a day';
}

/** "25y 3m" remaining-term chip. */
export function formatTerm(termMonths: number): string {
  const y = Math.floor(termMonths / 12);
  const m = termMonths % 12;
  if (y === 0) return `${m}m`;
  return m === 0 ? `${y}y` : `${y}y ${m}m`;
}

/** Today's date as ISO yyyy-mm-dd (device-local calendar day). */
export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
