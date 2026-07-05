export type RepaymentType = 'repayment' | 'interest-only';

/** A logged one-off overpayment. */
export interface Overpayment {
  id: string;
  /** ISO yyyy-mm-dd the payment was made. */
  date: string;
  amount: number;
}

export interface Mortgage {
  id: string;
  lender: string;
  /** Outstanding balance in pounds, as entered by the user. */
  balance: number;
  /** The date the balance above was correct, ISO yyyy-mm-dd. Set on create/edit. */
  balanceAsOf: string;
  /** Current deal's annual interest rate, percent (e.g. 4.92). */
  ratePct: number;
  /** Monthly payment in pounds. Derived from balance/rate/term if not entered. */
  monthlyPayment: number;
  /** True when the user left payment blank and we derived it. */
  paymentDerived: boolean;
  /** Fixed/deal period end date, ISO yyyy-mm-dd. */
  dealEndDate: string;
  /** Remaining full mortgage term in months. */
  remainingTermMonths: number;
  repaymentType: RepaymentType;
  /** Optional, pounds — enables the LTV badge. */
  propertyValue?: number;
  /** Optional early-repayment charge, percent per deal year (year 1 first). */
  ercSchedulePct?: number[];
  /** Optional: the lender's SVR/revert rate, percent. Used for the SVR-drift
   * warning instead of the BoE average revert-to-rate when entered. */
  lenderSvrPct?: number;
  /** Logged overpayments — adjust the balance projection and count against
   * the annual allowance. */
  overpayments?: Overpayment[];
  /** Annual overpayment allowance, percent of balance (default 10). */
  allowancePct?: number;
  /** When the allowance year resets: deal anniversary (default) or 1 Jan. */
  allowanceReset?: 'anniversary' | 'calendar';
  createdAt: string;
  updatedAt: string;
}

export const MAX_MORTGAGES = 5;

export const COMMON_LENDERS = [
  'Halifax',
  'Nationwide',
  'NatWest',
  'Santander',
  'Barclays',
  'HSBC',
  'Lloyds',
  'Virgin Money',
  'Skipton',
  'Coventry BS',
  'Yorkshire BS',
  'TSB',
] as const;
