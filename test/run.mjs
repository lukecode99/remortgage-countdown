// Unit tests for the pure logic: amortisation engine, formatting, wizard
// validation. Bundles the .ts modules with esbuild, runs with node:assert.
//
//   node test/run.mjs
//
// The engine assertions are hand-verified worked examples (FF-3 standard):
//   £100,000 at 6.0% over 25 years  → £644.30/month  (canonical annuity figure)
//   £200,000 at 5.0% over 25 years  → £1,169.18/month; £195,876 after 1 year
//   £150,000 at 4.8%                → £600 monthly interest
import { execSync } from 'child_process';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import assert from 'node:assert';

const outDir = mkdtempSync(join(tmpdir(), 'rm-app-test-'));
const root = join(import.meta.dirname, '..');
for (const mod of ['amortisation', 'format', 'wizard', 'market', 'overpay']) {
  execSync(
    `npx esbuild src/${mod}.ts --bundle --format=esm --platform=node --outfile=${join(outDir, mod + '.mjs')}`,
    { cwd: root, stdio: 'pipe' },
  );
}
const am = await import(join(outDir, 'amortisation.mjs'));
const fmt = await import(join(outDir, 'format.mjs'));
const wiz = await import(join(outDir, 'wizard.mjs'));
const mkt = await import(join(outDir, 'market.mjs'));
const op = await import(join(outDir, 'overpay.mjs'));

let passed = 0;
const test = (name, fn) => {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
};
const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) < eps, `${msg ?? ''} expected ~${b}, got ${a}`);

console.log('amortisation — worked examples');
test('monthly interest: £150,000 at 4.8% is £600', () => {
  near(am.monthlyInterest(150000, 4.8), 600, 1e-6);
});
test('annuity payment: £100,000 at 6% over 300 months is £644.30', () => {
  near(am.derivePayment(100000, 6, 300, 'repayment'), 644.3, 0.005);
});
test('annuity payment: £200,000 at 5% over 300 months is £1,169.18', () => {
  near(am.derivePayment(200000, 5, 300, 'repayment'), 1169.18, 0.005);
});
test('interest-only payment is just the interest', () => {
  near(am.derivePayment(150000, 4.8, 300, 'interest-only'), 600, 1e-6);
});
test('zero-rate payment is straight-line', () => {
  assert.strictEqual(am.derivePayment(120000, 0, 240, 'repayment'), 500);
});
test('projection: £200,000 at 5% paying £1,169.18 leaves ~£195,876 after 12 months', () => {
  near(am.projectBalance(200000, 5, 1169.18, 12, 'repayment'), 195876.2, 1);
});
test('projection amortises to zero over the full term', () => {
  const pay = am.derivePayment(100000, 6, 300, 'repayment');
  near(am.projectBalance(100000, 6, pay, 300, 'repayment'), 0, 0.01);
});
test('projection clamps at zero when overpaying', () => {
  assert.strictEqual(am.projectBalance(1000, 5, 600, 12, 'repayment'), 0);
});
test('interest-only balance never moves', () => {
  assert.strictEqual(am.projectBalance(150000, 4.8, 600, 24, 'interest-only'), 150000);
});
test('payment below interest grows the balance', () => {
  assert.ok(am.projectBalance(200000, 5, 500, 12, 'repayment') > 200000);
});

console.log('LTV');
test('£150,000 on a £250,000 property is 60%', () => {
  assert.strictEqual(am.ltvPct(150000, 250000), 60);
});
test('no property value → null', () => {
  assert.strictEqual(am.ltvPct(150000, undefined), null);
  assert.strictEqual(am.ltvPct(150000, 0), null);
});

console.log('countdown');
test('tomorrow is 1 day away', () => {
  assert.strictEqual(am.daysUntil('2026-07-05', '2026-07-06'), 1);
});
test('a year out (no leap day) is 365 days', () => {
  assert.strictEqual(am.daysUntil('2026-07-05', '2027-07-05'), 365);
});
test('5 Jul 2026 → 31 Mar 2027 is 8 months, 26 days', () => {
  const c = am.countdown('2026-07-05', '2027-03-31');
  assert.strictEqual(c.months, 8);
  assert.strictEqual(c.remDays, 26);
  assert.strictEqual(c.days, 269);
});
test('deal end in the past → negative days, zeroed breakdown', () => {
  const c = am.countdown('2026-07-05', '2026-06-01');
  assert.ok(c.days < 0);
  assert.strictEqual(c.months, 0);
  assert.strictEqual(c.remDays, 0);
});
test('whole months, day-of-month aware', () => {
  assert.strictEqual(am.wholeMonthsBetween('2026-01-15', '2026-07-05'), 5);
  assert.strictEqual(am.wholeMonthsBetween('2026-01-15', '2026-07-15'), 6);
  assert.strictEqual(am.wholeMonthsBetween('2026-07-05', '2026-07-05'), 0);
});

console.log('currentBalance');
test('rolls the stored balance forward by whole elapsed months', () => {
  const m = {
    balance: 200000, balanceAsOf: '2025-07-05', ratePct: 5, monthlyPayment: 1169.18,
    repaymentType: 'repayment',
  };
  near(am.currentBalance(m, '2026-07-05'), 195876.2, 1);
  assert.strictEqual(am.currentBalance(m, '2025-07-05'), 200000);
});

console.log('ERC schedule');
const ercM = { dealEndDate: '2027-07-05', ercSchedulePct: [5, 4, 3, 2, 1] };
test('12+ months out with a 5-year schedule → year-4 rate (2%)', () => {
  assert.strictEqual(am.ercPctNow(ercM, '2026-07-05'), 2);
});
test('final year → last entry (1%)', () => {
  assert.strictEqual(am.ercPctNow(ercM, '2026-08-05'), 1);
});
test('after deal end → null; no schedule → null', () => {
  assert.strictEqual(am.ercPctNow(ercM, '2027-07-06'), null);
  assert.strictEqual(am.ercPctNow({ dealEndDate: '2027-07-05' }, '2026-07-05'), null);
});

console.log('format');
test('pounds rounding and separators', () => {
  assert.strictEqual(fmt.formatPounds(195876.19), '£195,876');
  assert.strictEqual(fmt.formatPoundsPence(644.3), '£644.30');
});
test('percent trims trailing noise', () => {
  assert.strictEqual(fmt.formatPct(60), '60%');
  assert.strictEqual(fmt.formatPct(4.919999), '4.92%');
});
test('dates and countdown lines', () => {
  assert.strictEqual(fmt.formatDate('2027-03-31'), '31 Mar 2027');
  assert.strictEqual(fmt.formatDays(1), '1 day');
  assert.strictEqual(fmt.formatDays(269), '269 days');
  assert.strictEqual(fmt.formatDays(0), 'Deal ended');
  assert.strictEqual(fmt.formatMonthsDays(8, 26), '8 months, 26 days');
  assert.strictEqual(fmt.formatMonthsDays(1, 0), '1 month');
  assert.strictEqual(fmt.formatTerm(253), '21y 1m');
  assert.strictEqual(fmt.formatTerm(12), '1y');
  assert.strictEqual(fmt.formatTerm(6), '6m');
});

console.log('wizard validation');
const TODAY = '2026-07-05';
const goodForm = () => ({
  ...wiz.emptyForm(),
  lender: 'Nationwide',
  balance: '185,000',
  ratePct: '4.92',
  dealEndDay: '31',
  dealEndMonth: '3',
  dealEndYear: '2027',
  termYears: '21',
  termMonths: '0',
});
test('happy path derives the payment when left blank', () => {
  const r = wiz.validateWizard(goodForm(), TODAY);
  assert.ok(r.ok, JSON.stringify(r.errors));
  assert.strictEqual(r.draft.balance, 185000);
  assert.strictEqual(r.draft.dealEndDate, '2027-03-31');
  assert.strictEqual(r.draft.remainingTermMonths, 252);
  assert.ok(r.draft.paymentDerived);
  near(r.draft.monthlyPayment, am.derivePayment(185000, 4.92, 252, 'repayment'), 0.01);
});
test('entered payment is kept, not derived', () => {
  const r = wiz.validateWizard({ ...goodForm(), monthlyPayment: '1200' }, TODAY);
  assert.ok(r.ok);
  assert.strictEqual(r.draft.monthlyPayment, 1200);
  assert.ok(!r.draft.paymentDerived);
});
test('payment below monthly interest warns but saves', () => {
  const r = wiz.validateWizard({ ...goodForm(), monthlyPayment: '100' }, TODAY);
  assert.ok(r.ok);
  assert.ok(r.warning && /below the monthly interest/.test(r.warning));
});
test('missing required fields error individually', () => {
  const r = wiz.validateWizard(wiz.emptyForm(), TODAY);
  assert.ok(!r.ok);
  for (const k of ['lender', 'balance', 'ratePct', 'dealEndYear', 'termYears']) {
    assert.ok(r.errors[k], `expected error for ${k}`);
  }
});
test('past deal end date rejected', () => {
  const r = wiz.validateWizard({ ...goodForm(), dealEndYear: '2025' }, TODAY);
  assert.ok(!r.ok && /past/.test(r.errors.dealEndYear));
});
test('invalid calendar date rejected (31 Feb)', () => {
  const r = wiz.validateWizard({ ...goodForm(), dealEndDay: '31', dealEndMonth: '2' }, TODAY);
  assert.ok(!r.ok && r.errors.dealEndYear);
});
test('ERC list parses; junk rejected', () => {
  const good = wiz.validateWizard({ ...goodForm(), erc: '5, 4, 3, 2, 1' }, TODAY);
  assert.deepStrictEqual(good.draft.ercSchedulePct, [5, 4, 3, 2, 1]);
  const bad = wiz.validateWizard({ ...goodForm(), erc: '5, banana' }, TODAY);
  assert.ok(!bad.ok && bad.errors.erc);
});
test('property value optional but validated when present', () => {
  const withPv = wiz.validateWizard({ ...goodForm(), propertyValue: '£310,000' }, TODAY);
  assert.strictEqual(withPv.draft.propertyValue, 310000);
  const bad = wiz.validateWizard({ ...goodForm(), propertyValue: 'abc' }, TODAY);
  assert.ok(!bad.ok && bad.errors.propertyValue);
});
test('interest-only derivation via the wizard', () => {
  const r = wiz.validateWizard({ ...goodForm(), repaymentType: 'interest-only' }, TODAY);
  assert.ok(r.ok);
  near(r.draft.monthlyPayment, am.monthlyInterest(185000, 4.92), 0.01);
});
test('round-trip: formFromMortgage reproduces the draft', () => {
  const r = wiz.validateWizard({ ...goodForm(), erc: '3, 2', propertyValue: '310000', lenderSvr: '7.99' }, TODAY);
  const m = { ...r.draft, id: 'x', balanceAsOf: TODAY, createdAt: 't', updatedAt: 't' };
  const f = wiz.formFromMortgage(m);
  const r2 = wiz.validateWizard(f, TODAY);
  assert.ok(r2.ok);
  assert.deepStrictEqual(r2.draft, r.draft);
});
test('lender SVR optional but validated when present', () => {
  const good = wiz.validateWizard({ ...goodForm(), lenderSvr: '7.99' }, TODAY);
  assert.strictEqual(good.draft.lenderSvrPct, 7.99);
  const blank = wiz.validateWizard(goodForm(), TODAY);
  assert.strictEqual(blank.draft.lenderSvrPct, undefined);
  const bad = wiz.validateWizard({ ...goodForm(), lenderSvr: '45' }, TODAY);
  assert.ok(!bad.ok && bad.errors.lenderSvr);
});

console.log('market — LTV band mapping');
test('smallest published band that covers the LTV, edges inclusive', () => {
  assert.strictEqual(mkt.bandForLtv(50).band, 60);
  assert.strictEqual(mkt.bandForLtv(60).band, 60);
  assert.strictEqual(mkt.bandForLtv(60.01).band, 75);
  assert.strictEqual(mkt.bandForLtv(72).band, 75); // the card's example
  assert.strictEqual(mkt.bandForLtv(75).band, 75);
  assert.strictEqual(mkt.bandForLtv(75.1).band, 85);
  assert.strictEqual(mkt.bandForLtv(90).band, 90);
  assert.strictEqual(mkt.bandForLtv(95).band, 95);
});
test('above 95% clamps to 95 with a note; unknown LTV defaults to 75 with a note', () => {
  const high = mkt.bandForLtv(97);
  assert.strictEqual(high.band, 95);
  assert.ok(high.note);
  const unknown = mkt.bandForLtv(null);
  assert.strictEqual(unknown.band, 75);
  assert.ok(unknown.note);
});
test('series selection: 2yr fixes span the bands, longer fixes force 75%', () => {
  assert.strictEqual(mkt.seriesFor(2, 60).code, 'IUMZICQ');
  assert.strictEqual(mkt.seriesFor(2, 75).code, 'IUMBV34');
  assert.strictEqual(mkt.seriesFor(2, 85).code, 'IUMZICR');
  assert.strictEqual(mkt.seriesFor(2, 90).code, 'IUMB482');
  assert.strictEqual(mkt.seriesFor(2, 95).code, 'IUM2WTL');
  assert.strictEqual(mkt.seriesFor(3, 75).code, 'IUMBV37');
  assert.strictEqual(mkt.seriesFor(5, 75).code, 'IUMBV42');
  assert.strictEqual(mkt.seriesFor(10, 75).code, 'IUMBV45');
  const forced = mkt.seriesFor(5, 90);
  assert.strictEqual(forced.code, 'IUMBV42');
  assert.strictEqual(forced.band, 75);
  assert.ok(forced.bandNote);
  assert.strictEqual(mkt.seriesFor(3, 75).bandNote, null);
});

console.log('market — staleness & provenance');
test('data ≤2 months old is fresh, >2 months is stale', () => {
  assert.strictEqual(mkt.monthsOld('2026-05-31', '2026-07-05'), 2);
  assert.strictEqual(mkt.isStale('2026-05-31', '2026-07-05'), false);
  assert.strictEqual(mkt.monthsOld('2026-04-30', '2026-07-05'), 3);
  assert.strictEqual(mkt.isStale('2026-04-30', '2026-07-05'), true);
});
test('month label for provenance', () => {
  assert.strictEqual(mkt.monthLabel('2026-05-31'), 'May 2026');
});

console.log('market — savings worked example');
// Hand-computed: £100,000 at 6% over 300 months pays £644.30/mo. At a 4.1%
// benchmark on the same balance/term the annuity is £341.6667/0.640577 =
// £533.37/mo, so switching saves £110.93/mo.
const SNAPSHOT = {
  fetchedAt: '2026-07-05T08:00:00Z',
  asOf: '2026-05-31',
  rates: [
    { code: 'IUMBV34', label: '2yr fixed, 75% LTV', cadence: 'monthly', value: 4.1, date: '2026-05-31' },
    { code: 'IUMZICQ', label: '2yr fixed, 60% LTV', cadence: 'monthly', value: 3.9, date: '2026-05-31' },
    { code: 'IUMBV42', label: '5yr fixed, 75% LTV', cadence: 'monthly', value: 4.3, date: '2026-05-31' },
    { code: 'IUMTLMV', label: 'Revert-to-rate (ex-SVR)', cadence: 'monthly', value: 6.6, date: '2026-05-31' },
  ],
};
const baseMortgage = {
  id: 'm1', lender: 'Halifax', balance: 100000, balanceAsOf: TODAY, ratePct: 6,
  monthlyPayment: 644.3, paymentDerived: true, dealEndDate: '2027-03-31',
  remainingTermMonths: 300, repaymentType: 'repayment',
  createdAt: 't', updatedAt: 't',
};
test('your 6% vs a 4.1% benchmark saves £110.93/mo on £100k over 300 months', () => {
  const c = mkt.compareToMarket(baseMortgage, SNAPSHOT, TODAY, 2);
  assert.strictEqual(c.code, 'IUMBV34'); // unknown LTV → 75% band
  assert.ok(c.bandNote); // and says so
  assert.strictEqual(c.benchmarkPct, 4.1);
  assert.strictEqual(c.asOfMonth, 'May 2026');
  assert.strictEqual(c.stale, false);
  near(c.newPayment, 533.37, 0.05);
  near(c.savingMonthly, 110.93, 0.05);
});
test('known LTV picks its band series (50% LTV → 60% band)', () => {
  const c = mkt.compareToMarket({ ...baseMortgage, propertyValue: 200000 }, SNAPSHOT, TODAY, 2);
  assert.strictEqual(c.code, 'IUMZICQ');
  assert.strictEqual(c.band, 60);
  assert.strictEqual(c.bandNote, null);
});
test('balance and term roll forward from balanceAsOf', () => {
  const c = mkt.compareToMarket({ ...baseMortgage, balanceAsOf: '2026-01-05' }, SNAPSHOT, TODAY, 2);
  assert.strictEqual(c.termMonths, 294); // 6 months elapsed
  assert.ok(c.balanceToday < 100000 && c.balanceToday > 98000);
});
test('missing series → null (no made-up numbers)', () => {
  const c = mkt.compareToMarket(baseMortgage, { ...SNAPSHOT, rates: [] }, TODAY, 2);
  assert.strictEqual(c, null);
});

console.log('market — SVR drift window');
test('hidden at exactly 3 whole months out, shown a day inside', () => {
  const m = { ...baseMortgage, dealEndDate: '2026-10-05' };
  assert.strictEqual(mkt.svrDrift(m, SNAPSHOT, '2026-07-05'), null); // exactly 3 months
  assert.ok(mkt.svrDrift(m, SNAPSHOT, '2026-07-06')); // 2 whole months left
});
test('hidden once the deal has ended', () => {
  const m = { ...baseMortgage, dealEndDate: '2026-10-05' };
  assert.strictEqual(mkt.svrDrift(m, SNAPSHOT, '2026-10-05'), null);
  assert.strictEqual(mkt.svrDrift(m, SNAPSHOT, '2026-11-01'), null);
});
test('uses the BoE revert-to-rate by default, with provenance', () => {
  const m = { ...baseMortgage, dealEndDate: '2026-08-20' };
  const d = mkt.svrDrift(m, SNAPSHOT, '2026-07-05');
  assert.strictEqual(d.revertPct, 6.6);
  assert.strictEqual(d.usingLenderSvr, false);
  assert.strictEqual(d.asOfMonth, 'May 2026');
});
test('prefers the user-entered lender SVR', () => {
  const m = {
    ...baseMortgage, dealEndDate: '2026-08-20', lenderSvrPct: 7.99,
    repaymentType: 'interest-only', ratePct: 3, monthlyPayment: 250,
  };
  const d = mkt.svrDrift(m, SNAPSHOT, '2026-07-05');
  assert.strictEqual(d.revertPct, 7.99);
  assert.ok(d.usingLenderSvr);
  assert.strictEqual(d.asOfMonth, null);
  // Interest-only keeps the balance at £100k: 100000 × 7.99%/12 = £665.83/mo.
  near(d.paymentOnRevert, 665.83, 0.01);
  near(d.extraMonthly, 415.83, 0.01);
});

console.log('overpay — instant impact worked examples');
// Hand-simulated: £1,000 at 12% (1%/mo) paying £100/mo clears in 11 months
// with £58.98 total interest. A £100 one-off up front clears it in 10 months
// (£47.94 interest, saving £11.05); £50/mo extra clears it in 7 months
// (£40.11 interest, saving £18.88, cutting 4 months).
test('baseline: £1,000 at 12% paying £100/mo → 11 months, £58.98 interest', () => {
  const i = op.overpaymentImpact(1000, 12, 100, 24, 'repayment', 0, 0);
  assert.strictEqual(i.baselineMonths, 11);
  near(i.baselineInterest, 58.98, 0.01);
});
test('£100 one-off → 10 months, £47.94 interest, saves £11.05, cuts 1 month', () => {
  const i = op.overpaymentImpact(1000, 12, 100, 24, 'repayment', 100, 0);
  assert.strictEqual(i.newMonths, 10);
  assert.strictEqual(i.monthsCut, 1);
  near(i.newInterest, 47.94, 0.01);
  near(i.interestSaved, 11.05, 0.01);
});
test('£50/mo recurring → 7 months, £40.11 interest, saves £18.88, cuts 4 months', () => {
  const i = op.overpaymentImpact(1000, 12, 100, 24, 'repayment', 0, 50);
  assert.strictEqual(i.newMonths, 7);
  assert.strictEqual(i.monthsCut, 4);
  near(i.newInterest, 40.11, 0.01);
  near(i.interestSaved, 18.88, 0.01);
});
test('interest-only: £10k one-off on £100k at 6% saves exactly £600 over 12 months', () => {
  // Interest is 0.5%/mo on the outstanding balance: £6,000/yr on £100k,
  // £5,400/yr on £90k — the term doesn't shorten, only the interest drops.
  const i = op.overpaymentImpact(100000, 6, 500, 12, 'interest-only', 10000, 0);
  near(i.baselineInterest, 6000, 0.01);
  near(i.newInterest, 5400, 0.01);
  near(i.interestSaved, 600, 0.01);
  assert.strictEqual(i.monthsCut, 0);
});

console.log('overpay — allowance tracker');
const allowM = {
  ...baseMortgage, // balance 100000, balanceAsOf TODAY, dealEndDate '2027-03-31'
  overpayments: [
    { id: 'a', date: '2026-03-30', amount: 500 }, // day before the allowance year starts
    { id: 'b', date: '2026-04-15', amount: 3000 },
  ],
};
test('anniversary year runs deal-end date to deal-end date', () => {
  const y = op.allowanceYear(allowM, TODAY);
  assert.deepStrictEqual(y, { start: '2026-03-31', resetDate: '2027-03-31' });
});
test('10% of £100k = £10k limit; only in-year overpayments count', () => {
  const s = op.allowanceStatus(allowM, TODAY);
  assert.strictEqual(s.limit, 10000);
  assert.strictEqual(s.used, 3000); // the £500 on 30 Mar predates the year
  assert.strictEqual(s.left, 7000);
  assert.strictEqual(s.resetDate, '2027-03-31');
  assert.strictEqual(s.allowancePct, 10);
});
test('breach warning fires only when the total would exceed the limit', () => {
  assert.strictEqual(op.wouldBreachAllowance(allowM, TODAY, 7500), true);
  assert.strictEqual(op.wouldBreachAllowance(allowM, TODAY, 7000), false); // exactly at the limit is fine
});
test('calendar mode resets 1 Jan and counts the whole calendar year', () => {
  const m = { ...allowM, allowanceReset: 'calendar' };
  const y = op.allowanceYear(m, TODAY);
  assert.deepStrictEqual(y, { start: '2026-01-01', resetDate: '2027-01-01' });
  assert.strictEqual(op.allowanceStatus(m, TODAY).used, 3500); // both ops fall in 2026
});
test('allowance percentage is configurable', () => {
  const s = op.allowanceStatus({ ...allowM, allowancePct: 5 }, TODAY);
  assert.strictEqual(s.limit, 5000);
  assert.strictEqual(op.wouldBreachAllowance({ ...allowM, allowancePct: 5 }, TODAY, 2001), true);
});

console.log('overpay — overpay vs save');
test('higher-rate saver at 6.5% keeps 3.9% — overpaying a 5% mortgage wins', () => {
  const v = op.overpayVsSave(5, 6.5, 'higher');
  near(v.postTaxSavingsPct, 3.9, 1e-9);
  assert.strictEqual(v.verdict, 'overpay');
});
test('same rates in an ISA keep the full 6.5% — verdict flips to save', () => {
  const v = op.overpayVsSave(5, 6.5, 'isa');
  assert.strictEqual(v.postTaxSavingsPct, 6.5);
  assert.strictEqual(v.verdict, 'save');
});
test('basic-rate 5% keeps exactly 4% — dead heat with a 4% mortgage', () => {
  assert.strictEqual(op.overpayVsSave(4, 5, 'basic').verdict, 'tie');
});

console.log('overpay — effective balance (dashboard projection)');
const effM = {
  ...baseMortgage, balance: 100000, balanceAsOf: '2025-07-05', ratePct: 6,
  monthlyPayment: 644.3, remainingTermMonths: 300,
};
test('no logged overpayments → same as the rolled-forward balance', () => {
  assert.strictEqual(op.effectiveBalance(effM, '2026-07-05'), am.currentBalance(effM, '2026-07-05'));
});
test('a £5k overpayment compounds at the mortgage rate: £5,308.39 off after a year', () => {
  const m = { ...effM, overpayments: [{ id: 'a', date: '2025-07-05', amount: 5000 }] };
  const base = am.currentBalance(effM, '2026-07-05');
  near(op.effectiveBalance(m, '2026-07-05'), base - 5000 * Math.pow(1.005, 12), 0.01);
  near(base - op.effectiveBalance(m, '2026-07-05'), 5308.39, 0.01);
});
test('interest-only balances just drop by the amount', () => {
  const m = { ...effM, repaymentType: 'interest-only', overpayments: [{ id: 'a', date: '2025-07-05', amount: 5000 }] };
  assert.strictEqual(op.effectiveBalance(m, '2026-07-05'), 95000);
});
test('overpayments predating the entered balance are ignored (edit re-baselines)', () => {
  const m = { ...effM, overpayments: [{ id: 'a', date: '2025-07-04', amount: 5000 }] };
  assert.strictEqual(op.effectiveBalance(m, '2026-07-05'), am.currentBalance(effM, '2026-07-05'));
});
test('market comparison uses the overpayment-adjusted balance', () => {
  const withOp = { ...baseMortgage, overpayments: [{ id: 'a', date: TODAY, amount: 20000 }] };
  const c = mkt.compareToMarket(withOp, SNAPSHOT, TODAY, 2);
  near(c.balanceToday, 80000, 0.01);
  assert.ok(c.newPayment < 533.37); // smaller balance, smaller payment
});

console.log('overpay — logging');
test('addOverpayment keeps the list date-sorted; removeOverpayment filters by id', () => {
  let list = op.addOverpayment(undefined, { id: 'b', date: '2026-05-01', amount: 200 });
  list = op.addOverpayment(list, { id: 'a', date: '2026-04-01', amount: 100 });
  assert.deepStrictEqual(list.map((o) => o.id), ['a', 'b']);
  assert.deepStrictEqual(op.removeOverpayment(list, 'a').map((o) => o.id), ['b']);
});

console.log(`\n${passed} tests passed`);
