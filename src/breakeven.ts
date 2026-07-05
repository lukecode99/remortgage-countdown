// ERC break-even and product-transfer vs remortgage — pure TS, unit-tested.
// Both tools output factual cost arithmetic ("cheaper over N years by £X"),
// never a recommendation; every assumption is an input the UI surfaces.
import { derivePayment, ercPctNow, projectBalance } from './amortisation';
import { effectiveBalance } from './overpay';
import type { Mortgage, RepaymentType } from './types';

/** Typical remortgage fees — editable defaults, not quotes. */
export const FEE_DEFAULTS = {
  arrangement: 999,
  legals: 300,
  valuation: 250,
} as const;

/** Pounds of ERC payable today: the schedule's current % of today's balance. */
export function ercAmountNow(m: Mortgage, todayIso: string): number {
  const pct = ercPctNow(m, todayIso);
  if (pct === null) return 0;
  return (pct / 100) * effectiveBalance(m, todayIso);
}

/** ISO date `months` months on (day clamped to the target month's length). */
export function isoAddMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const lastDay = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return `${ny}-${String(nm).padStart(2, '0')}-${String(Math.min(d, lastDay)).padStart(2, '0')}`;
}

export interface BreakEven {
  /** Payment at the target rate on today's balance over the remaining term. */
  newPayment: number;
  monthlySaving: number;
  /** ERC + all fees. */
  upfrontCost: number;
  /** Whole months to recoup the upfront cost; null when there's no saving. */
  months: number | null;
  /** "Worth it if you'll stay past" this date (today + months); null as above. */
  worthItAfter: string | null;
}

/**
 * Months for the monthly saving at the target rate to repay the switching
 * cost (ERC plus fees): ceil(upfront / saving). Simple payback arithmetic —
 * it deliberately ignores interest on the fees themselves, and says so in
 * the UI.
 */
export function ercBreakEven(
  balanceToday: number,
  currentPayment: number,
  termMonths: number,
  type: RepaymentType,
  targetRatePct: number,
  ercAmount: number,
  fees: number,
): BreakEven {
  const newPayment = derivePayment(balanceToday, targetRatePct, termMonths, type);
  const monthlySaving = currentPayment - newPayment;
  const upfrontCost = ercAmount + fees;
  if (monthlySaving <= 0) {
    return { newPayment, monthlySaving, upfrontCost, months: null, worthItAfter: null };
  }
  const months = upfrontCost === 0 ? 0 : Math.ceil(upfrontCost / monthlySaving);
  return { newPayment, monthlySaving, upfrontCost, months, worthItAfter: null };
}

/** Break-even with the calendar date attached (today + break-even months). */
export function ercBreakEvenFrom(
  m: Mortgage,
  todayIso: string,
  targetRatePct: number,
  ercAmount: number,
  fees: number,
): BreakEven {
  const be = ercBreakEven(
    effectiveBalance(m, todayIso),
    m.monthlyPayment,
    m.remainingTermMonths,
    m.repaymentType,
    targetRatePct,
    ercAmount,
    fees,
  );
  return { ...be, worthItAfter: be.months === null ? null : isoAddMonths(todayIso, be.months) };
}

export interface OptionCost {
  ratePct: number;
  fees: number;
  erc: number;
  monthlyPayment: number;
  /** Interest accrued over the comparison horizon. */
  interest: number;
  /** Balance left at the end of the horizon. */
  balanceEnd: number;
  /** fees + erc + interest — the like-for-like cost of the option. */
  totalCost: number;
}

export interface PtVsRemortgage {
  horizonMonths: number;
  pt: OptionCost;
  remortgage: OptionCost;
  cheaper: 'pt' | 'remortgage' | 'tie';
  /** Positive pounds by which the cheaper option wins. */
  savingOverHorizon: number;
}

function optionCost(
  balance: number,
  ratePct: number,
  termMonths: number,
  type: RepaymentType,
  fees: number,
  erc: number,
  horizon: number,
): OptionCost {
  const monthlyPayment = derivePayment(balance, ratePct, termMonths, type);
  const balanceEnd = projectBalance(balance, ratePct, monthlyPayment, horizon, type);
  // Whatever was paid that didn't reduce the principal is interest.
  const interest = horizon * monthlyPayment - (balance - balanceEnd);
  return { ratePct, fees, erc, monthlyPayment, interest, balanceEnd, totalCost: fees + erc + interest };
}

export interface PtInputs {
  balanceToday: number;
  termMonths: number;
  repaymentType: RepaymentType;
  /** Product-transfer rate offered by the current lender. */
  ptRatePct: number;
  /** PT product fee (no legals/valuation on a transfer). */
  ptFee: number;
  /** Best full-remortgage rate. */
  remoRatePct: number;
  /** Arrangement + legals + valuation for the full remortgage. */
  remoFees: number;
  /** ERC payable for switching today. */
  ercAmount: number;
  /** Lender waives the ERC for a product transfer (common in the final 3–6 months). */
  ptErcFree: boolean;
  horizonMonths?: number;
}

/**
 * Side-by-side cost over the horizon (default 5 years, capped at the
 * remaining term). Cost = fees + ERC + interest accrued, so options with
 * different payments compare fairly — the extra principal a bigger payment
 * clears isn't a cost. A full remortgage before the deal ends always pays
 * the ERC; the transfer pays it only when the lender's ERC-free window
 * doesn't apply.
 */
export function ptVsRemortgage(i: PtInputs): PtVsRemortgage {
  const horizon = Math.min(i.horizonMonths ?? 60, i.termMonths);
  const pt = optionCost(
    i.balanceToday, i.ptRatePct, i.termMonths, i.repaymentType,
    i.ptFee, i.ptErcFree ? 0 : i.ercAmount, horizon,
  );
  const remortgage = optionCost(
    i.balanceToday, i.remoRatePct, i.termMonths, i.repaymentType,
    i.remoFees, i.ercAmount, horizon,
  );
  const diff = remortgage.totalCost - pt.totalCost;
  return {
    horizonMonths: horizon,
    pt,
    remortgage,
    cheaper: Math.abs(diff) < 0.005 ? 'tie' : diff > 0 ? 'pt' : 'remortgage',
    savingOverHorizon: Math.abs(diff),
  };
}
