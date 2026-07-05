// Pure form model for the setup wizard — string inputs in, validated mortgage
// draft out. Kept free of RN imports so validation and payment-derivation
// behaviour is unit-testable.
import { derivePayment, monthlyInterest } from './amortisation';
import type { Mortgage, RepaymentType } from './types';

export interface WizardForm {
  lender: string;
  balance: string;
  ratePct: string;
  monthlyPayment: string; // blank → derive from balance/rate/term
  dealEndDay: string;
  dealEndMonth: string;
  dealEndYear: string;
  termYears: string;
  termMonths: string;
  repaymentType: RepaymentType;
  propertyValue: string; // optional
  erc: string; // optional, e.g. "5, 4, 3, 2, 1"
  lenderSvr: string; // optional, the lender's SVR/revert %
}

export const emptyForm = (): WizardForm => ({
  lender: '',
  balance: '',
  ratePct: '',
  monthlyPayment: '',
  dealEndDay: '',
  dealEndMonth: '',
  dealEndYear: '',
  termYears: '',
  termMonths: '',
  repaymentType: 'repayment',
  propertyValue: '',
  erc: '',
  lenderSvr: '',
});

export function formFromMortgage(m: Mortgage): WizardForm {
  const [y, mo, d] = m.dealEndDate.split('-');
  return {
    lender: m.lender,
    balance: String(m.balance),
    ratePct: String(m.ratePct),
    monthlyPayment: m.paymentDerived ? '' : String(m.monthlyPayment),
    dealEndDay: String(Number(d)),
    dealEndMonth: String(Number(mo)),
    dealEndYear: y,
    termYears: String(Math.floor(m.remainingTermMonths / 12)),
    termMonths: String(m.remainingTermMonths % 12),
    repaymentType: m.repaymentType,
    propertyValue: m.propertyValue ? String(m.propertyValue) : '',
    erc: (m.ercSchedulePct ?? []).join(', '),
    lenderSvr: m.lenderSvrPct !== undefined ? String(m.lenderSvrPct) : '',
  };
}

export type MortgageDraft = Omit<Mortgage, 'id' | 'createdAt' | 'updatedAt' | 'balanceAsOf'>;

/** Lenient numeric field parser — strips £, %, commas and spaces. */
export const num = (s: string): number | null => {
  const cleaned = s.replace(/[£,%\s,]/g, '');
  if (cleaned === '') return null;
  const v = Number(cleaned);
  return Number.isFinite(v) ? v : null;
};

const daysInMonth = (y: number, m: number): number => new Date(Date.UTC(y, m, 0)).getUTCDate();

export interface WizardResult {
  ok: boolean;
  errors: Partial<Record<keyof WizardForm, string>>;
  draft?: MortgageDraft;
  /** Non-blocking warning, e.g. payment below monthly interest. */
  warning?: string;
}

export function validateWizard(f: WizardForm, todayIso: string): WizardResult {
  const errors: WizardResult['errors'] = {};

  const lender = f.lender.trim();
  if (!lender) errors.lender = 'Enter a lender name';

  const balance = num(f.balance);
  if (balance === null || balance <= 0) errors.balance = 'Enter the outstanding balance';
  else if (balance > 10_000_000) errors.balance = 'That balance looks too large';

  const rate = num(f.ratePct);
  if (rate === null || rate < 0) errors.ratePct = 'Enter the interest rate';
  else if (rate > 20) errors.ratePct = 'Rate should be the annual %, e.g. 4.92';

  const dd = num(f.dealEndDay);
  const dm = num(f.dealEndMonth);
  const dy = num(f.dealEndYear);
  let dealEndDate = '';
  if (
    dd === null || dm === null || dy === null ||
    !Number.isInteger(dd) || !Number.isInteger(dm) || !Number.isInteger(dy) ||
    dm < 1 || dm > 12 || dy < 2000 || dy > 2100 || dd < 1 || dd > daysInMonth(dy, dm)
  ) {
    errors.dealEndYear = 'Enter a valid deal end date';
  } else {
    dealEndDate = `${dy}-${String(dm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
    if (dealEndDate < todayIso) errors.dealEndYear = 'Deal end date is in the past';
  }

  const ty = num(f.termYears) ?? 0;
  const tm = num(f.termMonths) ?? 0;
  const remainingTermMonths = Math.round(ty * 12 + tm);
  if ((f.termYears.trim() === '' && f.termMonths.trim() === '') || remainingTermMonths <= 0) {
    errors.termYears = 'Enter the remaining term';
  } else if (remainingTermMonths > 480) {
    errors.termYears = 'Term should be 40 years or less';
  }

  let propertyValue: number | undefined;
  if (f.propertyValue.trim() !== '') {
    const pv = num(f.propertyValue);
    if (pv === null || pv <= 0) errors.propertyValue = 'Enter a valid property value (or leave blank)';
    else propertyValue = pv;
  }

  let lenderSvrPct: number | undefined;
  if (f.lenderSvr.trim() !== '') {
    const sv = num(f.lenderSvr);
    if (sv === null || sv <= 0 || sv > 20) errors.lenderSvr = 'SVR should be the annual %, e.g. 7.99 (or leave blank)';
    else lenderSvrPct = sv;
  }

  let ercSchedulePct: number[] | undefined;
  if (f.erc.trim() !== '') {
    const parts = f.erc.split(/[,;]/).map((p) => num(p));
    if (parts.some((p) => p === null || p < 0 || p > 25)) {
      errors.erc = 'ERC should be percentages per year, e.g. 5, 4, 3, 2, 1';
    } else {
      ercSchedulePct = parts as number[];
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const b = balance as number;
  const r = rate as number;
  const entered = num(f.monthlyPayment);
  let monthlyPayment: number;
  let paymentDerived = false;
  let warning: string | undefined;
  if (f.monthlyPayment.trim() === '' || entered === null) {
    monthlyPayment = Math.round(derivePayment(b, r, remainingTermMonths, f.repaymentType) * 100) / 100;
    paymentDerived = true;
  } else if (entered <= 0) {
    return { ok: false, errors: { monthlyPayment: 'Payment must be above zero (or leave blank to derive it)' } };
  } else {
    monthlyPayment = entered;
    if (f.repaymentType === 'repayment' && entered < monthlyInterest(b, r)) {
      warning = 'That payment is below the monthly interest, so the balance would grow. Double-check it.';
    }
  }

  return {
    ok: true,
    errors: {},
    warning,
    draft: {
      lender,
      balance: b,
      ratePct: r,
      monthlyPayment,
      paymentDerived,
      dealEndDate,
      remainingTermMonths,
      repaymentType: f.repaymentType,
      propertyValue,
      ercSchedulePct,
      lenderSvrPct,
    },
  };
}
