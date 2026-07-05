// Market comparison against Bank of England benchmark rates — pure TS, no RN
// imports, unit-tested. Data comes from the uk-mortgage-rates worker (RM-1),
// which serves the BoE IADB "quoted household rates" (monthly averages of
// advertised rates) plus the daily official Bank Rate.
//
// Honesty rules (FCA-safe, generic maths only): everything shown is labelled
// as a BoE *average quoted* rate with its as-of month, never a quote or a
// product recommendation; data more than 2 months old is flagged stale.
import { derivePayment, projectBalance, wholeMonthsBetween, daysUntil, ltvPct, currentBalance } from './amortisation';
import type { Mortgage } from './types';

export interface MarketRate {
  code: string;
  label: string;
  cadence: 'monthly' | 'daily';
  value: number;
  /** Last data point, ISO yyyy-mm-dd (monthly series end-of-month). */
  date: string;
}

export interface MarketSnapshot {
  fetchedAt: string;
  /** Latest month covered by the monthly (quoted-rate) series. */
  asOf: string;
  rates: MarketRate[];
  attribution?: string;
}

export type FixYears = 2 | 3 | 5 | 10;
export const FIX_OPTIONS: readonly FixYears[] = [2, 3, 5, 10];

/**
 * BoE quoted-rate series are published at the *maximum* LTV of a band, so a
 * borrower maps to the smallest published band that covers their LTV:
 * 72% → the 75% band, 75.0% exactly → the 75% band, 75.1% → the 85% band.
 * Above 95% there is nothing published — clamp to 95% and say so.
 * Unknown LTV (no property value) → the 75% band, the BoE's headline band.
 */
export const LTV_BANDS = [60, 75, 85, 90, 95] as const;
export type LtvBand = (typeof LTV_BANDS)[number];

export function bandForLtv(ltv: number | null): { band: LtvBand; note: string | null } {
  if (ltv === null) return { band: 75, note: 'LTV unknown — showing the 75% LTV benchmark' };
  for (const band of LTV_BANDS) {
    if (ltv <= band) return { band, note: null };
  }
  return { band: 95, note: `Your LTV (${Math.round(ltv)}%) is above the highest published band (95%)` };
}

// 2yr fixes are published across all five bands; 3/5/10yr only at 75% LTV.
const TWO_YEAR_BY_BAND: Record<LtvBand, string> = {
  60: 'IUMZICQ',
  75: 'IUMBV34',
  85: 'IUMZICR',
  90: 'IUMB482',
  95: 'IUM2WTL',
};
const LONGER_FIXES: Record<Exclude<FixYears, 2>, string> = {
  3: 'IUMBV37',
  5: 'IUMBV42',
  10: 'IUMBV45',
};
export const REVERT_RATE_CODE = 'IUMTLMV';

export function seriesFor(fixYears: FixYears, band: LtvBand): { code: string; band: LtvBand; bandNote: string | null } {
  if (fixYears === 2) return { code: TWO_YEAR_BY_BAND[band], band, bandNote: null };
  return {
    code: LONGER_FIXES[fixYears],
    band: 75,
    bandNote: band !== 75 ? `${fixYears}yr fixes are only published at 75% LTV` : null,
  };
}

/** "2026-05-31" → "May 2026" — provenance label for the quoted-rate month. */
export function monthLabel(isoDate: string): string {
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const [y, m] = isoDate.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

/** Whole calendar months between the data month and today (5 Jul on 31 May data → 2). */
export function monthsOld(asOfIso: string, todayIso: string): number {
  const [ay, am] = asOfIso.split('-').map(Number);
  const [ty, tm] = todayIso.split('-').map(Number);
  return Math.max(0, (ty - ay) * 12 + (tm - am));
}

/** BoE publishes monthly with a lag; beyond 2 months old the average is stale. */
export const isStale = (asOfIso: string, todayIso: string): boolean => monthsOld(asOfIso, todayIso) > 2;

export interface Comparison {
  /** The matched benchmark series. */
  code: string;
  label: string;
  band: LtvBand;
  bandNote: string | null;
  benchmarkPct: number;
  /** Month the BoE average refers to, e.g. "May 2026". */
  asOfMonth: string;
  stale: boolean;
  yourRatePct: number;
  /** Inputs to the recomputed payment — surfaced so the UI can show the maths. */
  balanceToday: number;
  termMonths: number;
  currentPayment: number;
  /** Payment at the benchmark rate on today's balance over the remaining term. */
  newPayment: number;
  /** Positive = switching to the benchmark average would cost less per month. */
  savingMonthly: number;
}

/**
 * Compare a mortgage against the matching BoE benchmark. The saving is the
 * current payment minus the payment recomputed at the benchmark rate on
 * today's projected balance over the remaining term (rolled forward by the
 * months elapsed since the balance was entered). Generic maths, not advice.
 */
export function compareToMarket(
  m: Mortgage,
  snapshot: MarketSnapshot,
  todayIso: string,
  fixYears: FixYears,
): Comparison | null {
  const balanceToday = currentBalance(m, todayIso);
  const ltv = ltvPct(balanceToday, m.propertyValue);
  const { band, note: ltvNote } = bandForLtv(ltv);
  const picked = seriesFor(fixYears, band);
  const rate = snapshot.rates.find((r) => r.code === picked.code);
  if (!rate) return null;

  const elapsed = wholeMonthsBetween(m.balanceAsOf, todayIso);
  const termMonths = Math.max(1, m.remainingTermMonths - elapsed);
  const newPayment = derivePayment(balanceToday, rate.value, termMonths, m.repaymentType);

  return {
    code: rate.code,
    label: rate.label,
    band: picked.band,
    bandNote: picked.bandNote ?? ltvNote,
    benchmarkPct: rate.value,
    asOfMonth: monthLabel(rate.date),
    stale: isStale(rate.date, todayIso),
    yourRatePct: m.ratePct,
    balanceToday,
    termMonths,
    currentPayment: m.monthlyPayment,
    newPayment,
    savingMonthly: m.monthlyPayment - newPayment,
  };
}

export interface SvrDrift {
  /** Rate the deal would lapse onto. */
  revertPct: number;
  /** True when using the user's entered lender SVR, not the BoE average. */
  usingLenderSvr: boolean;
  asOfMonth: string | null;
  stale: boolean;
  balanceAtExpiry: number;
  termAtExpiry: number;
  paymentOnRevert: number;
  /** Positive = lapsing costs this much more per month than the current deal. */
  extraMonthly: number;
}

/**
 * Cost per month of lapsing onto the revert rate when the deal ends. Shown
 * only inside the final 3 calendar months of the deal (and not after it has
 * ended): strictly fewer than 3 whole months between today and the end date.
 */
export function svrDrift(m: Mortgage, snapshot: MarketSnapshot | null, todayIso: string): SvrDrift | null {
  const days = daysUntil(todayIso, m.dealEndDate);
  if (days <= 0) return null;
  if (wholeMonthsBetween(todayIso, m.dealEndDate) >= 3) return null;

  const boe = snapshot?.rates.find((r) => r.code === REVERT_RATE_CODE) ?? null;
  const revertPct = m.lenderSvrPct ?? boe?.value;
  if (revertPct === undefined) return null;

  const monthsToExpiry = wholeMonthsBetween(m.balanceAsOf, m.dealEndDate);
  const balanceAtExpiry = projectBalance(m.balance, m.ratePct, m.monthlyPayment, monthsToExpiry, m.repaymentType);
  const termAtExpiry = Math.max(1, m.remainingTermMonths - monthsToExpiry);
  const paymentOnRevert = derivePayment(balanceAtExpiry, revertPct, termAtExpiry, m.repaymentType);

  return {
    revertPct,
    usingLenderSvr: m.lenderSvrPct !== undefined,
    asOfMonth: m.lenderSvrPct !== undefined ? null : boe ? monthLabel(boe.date) : null,
    stale: m.lenderSvrPct === undefined && boe ? isStale(boe.date, todayIso) : false,
    balanceAtExpiry,
    termAtExpiry,
    paymentOnRevert,
    extraMonthly: paymentOnRevert - m.monthlyPayment,
  };
}
