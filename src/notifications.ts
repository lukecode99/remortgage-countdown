// Local notification schedule — pure TS, no React Native imports, unit-tested.
// Builds the full plan of every notification the app should have scheduled
// given today's date; the RN layer (src/notify.ts) syncs the OS schedule to
// this plan with cancel-all-then-reschedule, so editing a deal date simply
// regenerates the plan and the schedule follows. No server in v1.
import { derivePayment, projectBalance, wholeMonthsBetween } from './amortisation';
import { isoAddMonths } from './breakeven';
import { formatPounds } from './format';
import { MarketSnapshot, REVERT_RATE_CODE } from './market';
import { allowanceYear } from './overpay';
import type { Mortgage } from './types';

/**
 * MPC announcement dates (Bank Rate decision days), static per year —
 * mirrors src/mpc.ts in the uk-mortgage-rates worker. Update yearly from
 * bankofengland.co.uk/monetary-policy/upcoming-mpc-dates.
 */
export const MPC_DATES: readonly string[] = [
  '2026-02-05',
  '2026-03-19',
  '2026-04-30',
  '2026-06-18',
  '2026-07-30',
  '2026-09-17',
  '2026-11-05',
  '2026-12-17',
];

/** Calendar-exact day arithmetic on ISO yyyy-mm-dd, UTC-safe. */
export function isoAddDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export type NotificationKind =
  | 'six-months'
  | 'three-months'
  | 'one-month'
  | 'one-week'
  | 'deal-end'
  | 'allowance-reset'
  | 'mpc';

export interface PlannedNotification {
  /** Stable identifier — `<mortgageId>:<kind>` or `mpc:<date>`. */
  id: string;
  /** Day the notification fires, ISO yyyy-mm-dd. */
  date: string;
  /** Local hour to fire at: 9am for countdown milestones, 6pm for MPC evenings. */
  hour: number;
  title: string;
  body: string;
  kind: NotificationKind;
}

/**
 * Extra £/month of lapsing onto the revert rate at deal end — the same maths
 * as RM-3's svrDrift but without its final-3-months display window, because
 * the deal-end notification is composed up-front (possibly months ahead).
 * Uses the lender SVR if entered, else the BoE average revert-to rate.
 */
export function revertExtraMonthly(m: Mortgage, snapshot: MarketSnapshot | null): number | null {
  const boe = snapshot?.rates.find((r) => r.code === REVERT_RATE_CODE) ?? null;
  const revertPct = m.lenderSvrPct ?? boe?.value;
  if (revertPct === undefined) return null;
  const monthsToExpiry = wholeMonthsBetween(m.balanceAsOf, m.dealEndDate);
  if (monthsToExpiry < 0) return null;
  const balanceAtExpiry = projectBalance(m.balance, m.ratePct, m.monthlyPayment, monthsToExpiry, m.repaymentType);
  const termAtExpiry = Math.max(1, m.remainingTermMonths - monthsToExpiry);
  const paymentOnRevert = derivePayment(balanceAtExpiry, revertPct, termAtExpiry, m.repaymentType);
  return paymentOnRevert - m.monthlyPayment;
}

function dealEndBody(m: Mortgage, snapshot: MarketSnapshot | null): string {
  const extra = revertExtraMonthly(m, snapshot);
  if (extra !== null && extra > 0) {
    return `Your ${m.lender} deal ends today. Doing nothing means the revert rate — roughly ${formatPounds(extra)}/mo more.`;
  }
  return `Your ${m.lender} deal ends today. If you haven't switched, you're likely moving onto the lender's revert rate.`;
}

/** Countdown milestones + allowance reset for one mortgage, unfiltered. */
function milestones(m: Mortgage, todayIso: string, snapshot: MarketSnapshot | null): PlannedNotification[] {
  const end = m.dealEndDate;
  const list: PlannedNotification[] = [
    {
      id: `${m.id}:six-months`,
      date: isoAddMonths(end, -6),
      hour: 9,
      title: `${m.lender}: 6 months to go`,
      body: 'You can lock a new deal today — most offers last up to 6 months, and you can still switch if rates fall before completion.',
      kind: 'six-months',
    },
    {
      id: `${m.id}:three-months`,
      date: isoAddMonths(end, -3),
      hour: 9,
      title: `${m.lender}: 3 months to go`,
      body: 'Time to compare. Check your rate against the market and what a product transfer would cost — both are in the app.',
      kind: 'three-months',
    },
    {
      id: `${m.id}:one-month`,
      date: isoAddMonths(end, -1),
      hour: 9,
      title: `${m.lender}: 1 month to go`,
      body: 'If nothing is lined up yet, a product transfer with your current lender can usually complete in time.',
      kind: 'one-month',
    },
    {
      id: `${m.id}:one-week`,
      date: isoAddDays(end, -7),
      hour: 9,
      title: `${m.lender}: 1 week to go`,
      body: 'Your deal ends in 7 days. Anything not completed by then means paying the revert rate in between.',
      kind: 'one-week',
    },
    {
      id: `${m.id}:deal-end`,
      date: end,
      hour: 9,
      title: `${m.lender}: deal ends today`,
      body: dealEndBody(m, snapshot),
      kind: 'deal-end',
    },
  ];

  // Allowance reset day. On anniversary reset this is the deal-end
  // anniversary, which in the deal's final year coincides with the deal-end
  // notification — skip it then rather than sending two on the same day.
  const { resetDate } = allowanceYear(m, todayIso);
  if (resetDate !== end) {
    list.push({
      id: `${m.id}:allowance-reset`,
      date: resetDate,
      hour: 9,
      title: `${m.lender}: overpayment allowance has reset`,
      body: 'A fresh year of penalty-free overpaying starts today. Log overpayments in the app to track it.',
      kind: 'allowance-reset',
    });
  }
  return list;
}

/**
 * The complete plan: countdown milestones and allowance resets per mortgage,
 * plus one evening entry per future MPC (Bank Rate decision) day. Future-only
 * (strictly after today — a same-day milestone whose hour may already have
 * passed is dropped; the QA test path covers immediate firing) and date-sorted.
 */
export function plannedNotifications(
  mortgages: Mortgage[],
  todayIso: string,
  snapshot: MarketSnapshot | null,
): PlannedNotification[] {
  const all: PlannedNotification[] = mortgages.flatMap((m) => milestones(m, todayIso, snapshot));

  // Base-rate day, v1: a local notification the evening of each MPC decision
  // day; the personalised £/mo impact comes from the next-app-open refresh.
  if (mortgages.length > 0) {
    for (const d of MPC_DATES) {
      all.push({
        id: `mpc:${d}`,
        date: d,
        hour: 18,
        title: 'Bank Rate decision today',
        body: 'The Bank of England announced its rate decision at midday. Open the app to refresh and see what it means for your deal.',
        kind: 'mpc',
      });
    }
  }

  return all
    .filter((n) => n.date > todayIso)
    .sort((a, b) => (a.date === b.date ? a.hour - b.hour : a.date.localeCompare(b.date)));
}
