// Pure amortisation maths — no RN imports, unit-tested with hand-verified
// worked examples in test/run.mjs. All money values are pounds; rates are
// annual percentages compounded monthly (the standard UK mortgage quote basis).
import type { Mortgage, RepaymentType } from './types';

export const monthlyRate = (annualPct: number): number => annualPct / 100 / 12;

/** One month's interest on a balance. £150,000 at 4.8% → £600. */
export const monthlyInterest = (balance: number, annualPct: number): number =>
  balance * monthlyRate(annualPct);

/**
 * Standard annuity payment for a repayment mortgage, or the interest for an
 * interest-only one. £100,000 at 6% over 300 months → £644.30.
 */
export function derivePayment(
  balance: number,
  annualPct: number,
  termMonths: number,
  type: RepaymentType,
): number {
  if (balance <= 0 || termMonths <= 0) return 0;
  if (type === 'interest-only') return monthlyInterest(balance, annualPct);
  const r = monthlyRate(annualPct);
  if (r === 0) return balance / termMonths;
  return (balance * r) / (1 - Math.pow(1 + r, -termMonths));
}

/**
 * Balance after `months` of paying `payment`, interest compounding monthly.
 * Iterative (interest added, then payment taken) so partial/odd payments
 * behave sensibly; clamps at zero. Interest-only balances don't move as long
 * as the payment covers the interest.
 */
export function projectBalance(
  balance: number,
  annualPct: number,
  payment: number,
  months: number,
  type: RepaymentType,
): number {
  if (balance <= 0) return 0;
  if (type === 'interest-only') return balance;
  const r = monthlyRate(annualPct);
  let b = balance;
  for (let i = 0; i < months; i++) {
    b = b * (1 + r) - payment;
    if (b <= 0) return 0;
  }
  return b;
}

/** Percent, or null when no property value is known. £150k on £250k → 60. */
export const ltvPct = (balance: number, propertyValue?: number): number | null =>
  propertyValue && propertyValue > 0 ? (balance / propertyValue) * 100 : null;

const MS_PER_DAY = 86_400_000;
const utcDate = (iso: string): number => {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};

/** Whole days from `todayIso` to `endIso` (negative once past). */
export const daysUntil = (todayIso: string, endIso: string): number =>
  Math.round((utcDate(endIso) - utcDate(todayIso)) / MS_PER_DAY);

/**
 * Calendar breakdown of the time to `endIso`: whole months plus leftover
 * days, both zero-floored (a past deal end reads 0m 0d — the days counter
 * carries the "expired" signal).
 */
export function countdown(todayIso: string, endIso: string): { days: number; months: number; remDays: number } {
  const days = daysUntil(todayIso, endIso);
  if (days <= 0) return { days, months: 0, remDays: 0 };
  const [ty, tm, td] = todayIso.split('-').map(Number);
  const [ey, em, ed] = endIso.split('-').map(Number);
  let months = (ey - ty) * 12 + (em - tm) - (ed < td ? 1 : 0);
  if (months < 0) months = 0;
  // Leftover days beyond the whole months: end date minus (today + months).
  const anchor = Date.UTC(ty, tm - 1 + months, td);
  const remDays = Math.max(0, Math.round((utcDate(endIso) - anchor) / MS_PER_DAY));
  return { days, months, remDays };
}

/** Whole months elapsed from `fromIso` to `toIso` (day-of-month aware, ≥0). */
export function wholeMonthsBetween(fromIso: string, toIso: string): number {
  const [fy, fm, fd] = fromIso.split('-').map(Number);
  const [ty, tm, td] = toIso.split('-').map(Number);
  const months = (ty - fy) * 12 + (tm - fm) - (td < fd ? 1 : 0);
  return Math.max(0, months);
}

/** The stored balance rolled forward to today with the recorded payment. */
export const currentBalance = (m: Mortgage, todayIso: string): number =>
  projectBalance(
    m.balance,
    m.ratePct,
    m.monthlyPayment,
    wholeMonthsBetween(m.balanceAsOf, todayIso),
    m.repaymentType,
  );

/** ERC percentage in force on `todayIso`, from a per-deal-year schedule. */
export function ercPctNow(m: Mortgage, todayIso: string): number | null {
  const sched = m.ercSchedulePct;
  if (!sched || sched.length === 0) return null;
  if (daysUntil(todayIso, m.dealEndDate) <= 0) return null;
  // Deal years counted back from the end date: with an n-entry schedule the
  // final year before dealEndDate is entry n-1.
  const monthsLeft = wholeMonthsBetween(todayIso, m.dealEndDate);
  const yearsLeft = Math.floor(monthsLeft / 12); // 0 = final year
  const idx = sched.length - 1 - yearsLeft;
  if (idx < 0) return sched[0];
  return sched[Math.min(idx, sched.length - 1)];
}
