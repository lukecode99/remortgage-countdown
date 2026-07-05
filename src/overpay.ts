// Overpayment tools — pure TS, unit-tested with hand-verified examples.
// Three calculators: instant impact of an overpayment (interest saved, months
// cut), the annual overpayment-allowance tracker, and overpay-vs-save.
import { currentBalance, monthlyRate, wholeMonthsBetween } from './amortisation';
import type { Mortgage, Overpayment, RepaymentType } from './types';

export interface Impact {
  baselineMonths: number;
  newMonths: number;
  monthsCut: number;
  baselineInterest: number;
  newInterest: number;
  interestSaved: number;
}

const MAX_MONTHS = 1200;

// Month-by-month: interest accrues, then the payment (plus any recurring
// overpayment) comes off; a one-off comes off the balance up front. For
// repayment mortgages the horizon is payoff; for interest-only the payment
// covers exactly the interest, so we run to the end of the term and count
// the interest on whatever balance remains outstanding each month.
function simulate(
  balance: number,
  annualPct: number,
  payment: number,
  termMonths: number,
  type: RepaymentType,
  oneOff: number,
  recurring: number,
): { months: number; interest: number } {
  const r = monthlyRate(annualPct);
  let b = Math.max(0, balance - oneOff);
  let interest = 0;
  const horizon = type === 'interest-only' ? Math.min(termMonths, MAX_MONTHS) : MAX_MONTHS;
  for (let month = 1; month <= horizon; month++) {
    if (b <= 0) return { months: month - 1, interest };
    const i = b * r;
    interest += i;
    const principalOff = type === 'interest-only' ? recurring : payment + recurring - i;
    b -= principalOff;
    if (type !== 'interest-only' && b <= 0) return { months: month, interest };
  }
  return { months: horizon, interest };
}

/** Effect of a one-off and/or recurring monthly overpayment. */
export function overpaymentImpact(
  balance: number,
  annualPct: number,
  payment: number,
  termMonths: number,
  type: RepaymentType,
  oneOff: number,
  recurring: number,
): Impact {
  const base = simulate(balance, annualPct, payment, termMonths, type, 0, 0);
  const withOp = simulate(balance, annualPct, payment, termMonths, type, oneOff, recurring);
  return {
    baselineMonths: base.months,
    newMonths: withOp.months,
    monthsCut: base.months - withOp.months,
    baselineInterest: base.interest,
    newInterest: withOp.interest,
    interestSaved: base.interest - withOp.interest,
  };
}

export const DEFAULT_ALLOWANCE_PCT = 10;

const isoAddYears = (iso: string, years: number): string => {
  const [y, m, d] = iso.split('-').map(Number);
  const lastDay = new Date(Date.UTC(y + years, m, 0)).getUTCDate();
  return `${y + years}-${String(m).padStart(2, '0')}-${String(Math.min(d, lastDay)).padStart(2, '0')}`;
};

/**
 * The allowance year containing `todayIso`. 'calendar' resets 1 January;
 * 'anniversary' resets on the deal-end date's month/day each year (the
 * product year — most lender allowances run on it). Start inclusive, end
 * exclusive; the reset date is the end.
 */
export function allowanceYear(m: Mortgage, todayIso: string): { start: string; resetDate: string } {
  const mode = m.allowanceReset ?? 'anniversary';
  const [ty] = todayIso.split('-').map(Number);
  if (mode === 'calendar') {
    return { start: `${ty}-01-01`, resetDate: `${ty + 1}-01-01` };
  }
  const [, em, ed] = m.dealEndDate.split('-').map(Number);
  const thisYears = `${ty}-${String(em).padStart(2, '0')}-${String(ed).padStart(2, '0')}`;
  return todayIso < thisYears
    ? { start: isoAddYears(thisYears, -1), resetDate: thisYears }
    : { start: thisYears, resetDate: isoAddYears(thisYears, 1) };
}

export interface AllowanceStatus {
  /** Pounds allowed this allowance year. */
  limit: number;
  used: number;
  left: number;
  resetDate: string;
  allowancePct: number;
}

/**
 * Allowance = pct (default 10%) of the balance at the start of the current
 * allowance year — projected forward from the entered balance when the year
 * started after it, the entered balance otherwise. Used = logged
 * overpayments dated inside the year (and not before the balance was
 * re-baselined by an edit).
 */
export function allowanceStatus(m: Mortgage, todayIso: string): AllowanceStatus {
  const pct = m.allowancePct ?? DEFAULT_ALLOWANCE_PCT;
  const { start, resetDate } = allowanceYear(m, todayIso);
  const balanceAtStart = start > m.balanceAsOf ? currentBalance(m, start) : m.balance;
  const limit = (pct / 100) * balanceAtStart;
  const used = (m.overpayments ?? [])
    .filter((o) => o.date >= start && o.date < resetDate)
    .reduce((sum, o) => sum + o.amount, 0);
  return { limit, used, left: Math.max(0, limit - used), resetDate, allowancePct: pct };
}

/** True when logging `amount` today would take the year's total over the limit. */
export function wouldBreachAllowance(m: Mortgage, todayIso: string, amount: number): boolean {
  const s = allowanceStatus(m, todayIso);
  return s.used + amount > s.limit;
}

export type TaxBand = 'basic' | 'higher' | 'isa';
export const TAX_BANDS: readonly TaxBand[] = ['basic', 'higher', 'isa'];

// Savings interest above the Personal Savings Allowance is taxed at the
// marginal rate; ISA interest isn't taxed. v1 assumes the PSA is already
// used up — the conservative comparison.
const TAX_KEEP: Record<TaxBand, number> = { basic: 0.8, higher: 0.6, isa: 1 };

export interface OverpayVsSave {
  mortgageRatePct: number;
  savingsRatePct: number;
  postTaxSavingsPct: number;
  /** 'overpay' when the mortgage rate beats the post-tax savings rate. */
  verdict: 'overpay' | 'save' | 'tie';
}

/** Overpaying "earns" the mortgage rate, guaranteed and tax-free. */
export function overpayVsSave(mortgageRatePct: number, savingsRatePct: number, band: TaxBand): OverpayVsSave {
  const postTax = savingsRatePct * TAX_KEEP[band];
  const diff = mortgageRatePct - postTax;
  return {
    mortgageRatePct,
    savingsRatePct,
    postTaxSavingsPct: postTax,
    verdict: Math.abs(diff) < 1e-9 ? 'tie' : diff > 0 ? 'overpay' : 'save',
  };
}

/**
 * Balance today including logged overpayments. Each overpayment made since
 * the balance was entered has been "earning" the mortgage rate, so its
 * effect today is its amount compounded monthly from its date (interest-only
 * balances just drop by the amount). Overpayments dated before `balanceAsOf`
 * are already baked into the entered balance and are ignored.
 */
export function effectiveBalance(m: Mortgage, todayIso: string): number {
  const base = currentBalance(m, todayIso);
  const ops = (m.overpayments ?? []).filter((o) => o.date >= m.balanceAsOf && o.date <= todayIso);
  if (!ops.length) return base;
  const r = monthlyRate(m.ratePct);
  const reduction = ops.reduce((sum, o) => {
    const months = wholeMonthsBetween(o.date, todayIso);
    return sum + (m.repaymentType === 'interest-only' ? o.amount : o.amount * Math.pow(1 + r, months));
  }, 0);
  return Math.max(0, base - reduction);
}

/** Insert a logged overpayment, keeping the list date-sorted. */
export function addOverpayment(list: Overpayment[] | undefined, op: Overpayment): Overpayment[] {
  return [...(list ?? []), op].sort((a, b) => a.date.localeCompare(b.date));
}

export function removeOverpayment(list: Overpayment[] | undefined, id: string): Overpayment[] {
  return (list ?? []).filter((o) => o.id !== id);
}
