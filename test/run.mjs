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
for (const mod of ['amortisation', 'format', 'wizard', 'market', 'overpay', 'breakeven', 'notifications', 'widgetData', 'referrals']) {
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
const bev = await import(join(outDir, 'breakeven.mjs'));
const ntf = await import(join(outDir, 'notifications.mjs'));
const wd = await import(join(outDir, 'widgetData.mjs'));
const ref = await import(join(outDir, 'referrals.mjs'));

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

console.log('breakeven — ERC break-even worked example');
// Hand-computed: £100k at 6% pays £644.30/mo over 300 months; at 4.1% the
// payment is £533.37, saving £110.93/mo. ERC 2% (£2,000) + fees £1,549 =
// £3,549 up front; 3,549 / 110.93 = 31.99 → breaks even in month 32.
test('£3,549 up front at £110.93/mo saving breaks even in 32 months', () => {
  const be = bev.ercBreakEven(100000, 644.3, 300, 'repayment', 4.1, 2000, 1549);
  near(be.newPayment, 533.37, 0.05);
  near(be.monthlySaving, 110.93, 0.05);
  assert.strictEqual(be.upfrontCost, 3549);
  assert.strictEqual(be.months, 32);
});
test('worth-it date attaches: 5 Jul 2026 + 32 months = 5 Mar 2029', () => {
  const m = { ...baseMortgage, ercSchedulePct: [5, 4, 3, 2, 1], dealEndDate: '2027-07-05' };
  const be = bev.ercBreakEvenFrom(m, TODAY, 4.1, 2000, 1549);
  assert.strictEqual(be.months, 32);
  assert.strictEqual(be.worthItAfter, '2029-03-05');
});
test('no saving at a higher rate → never breaks even', () => {
  const be = bev.ercBreakEven(100000, 644.3, 300, 'repayment', 7, 2000, 1549);
  assert.strictEqual(be.months, null);
  assert.strictEqual(be.worthItAfter, null);
  assert.ok(be.monthlySaving < 0);
});
test('nothing up front → breaks even immediately', () => {
  assert.strictEqual(bev.ercBreakEven(100000, 644.3, 300, 'repayment', 4.1, 0, 0).months, 0);
});
test('ERC amount from the schedule: 2% of £100k a year+ out = £2,000; none → £0', () => {
  const m = { ...baseMortgage, ercSchedulePct: [5, 4, 3, 2, 1], dealEndDate: '2027-07-05' };
  near(bev.ercAmountNow(m, TODAY), 2000, 0.01);
  assert.strictEqual(bev.ercAmountNow(baseMortgage, TODAY), 0);
});
test('isoAddMonths clamps the day to the target month', () => {
  assert.strictEqual(bev.isoAddMonths('2026-07-05', 32), '2029-03-05');
  assert.strictEqual(bev.isoAddMonths('2026-01-31', 1), '2026-02-28');
  assert.strictEqual(bev.isoAddMonths('2026-11-30', 3), '2027-02-28');
});

console.log('breakeven — PT vs remortgage');
// Hand-computed on interest-only £100k over 5 years (interest is exact):
//   remortgage at 4.1%: £20,500 interest + £1,549 fees + £2,000 ERC = £24,049
//   transfer  at 4.6%: £23,000 interest + £0 fee, ERC £2,000 unless waived
// ERC applies to both → remortgage wins by £951. ERC-free window for the
// transfer → PT £23,000 vs £24,049 → PT wins by £1,049. The toggle flips it.
const ptBase = {
  balanceToday: 100000, termMonths: 300, repaymentType: 'interest-only',
  ptRatePct: 4.6, ptFee: 0, remoRatePct: 4.1, remoFees: 1549,
  ercAmount: 2000, ptErcFree: false,
};
test('without the ERC-free window the remortgage is cheaper by £951', () => {
  const r = bev.ptVsRemortgage(ptBase);
  assert.strictEqual(r.horizonMonths, 60);
  near(r.pt.interest, 23000, 0.01);
  near(r.remortgage.interest, 20500, 0.01);
  near(r.pt.totalCost, 25000, 0.01);
  near(r.remortgage.totalCost, 24049, 0.01);
  assert.strictEqual(r.cheaper, 'remortgage');
  near(r.savingOverHorizon, 951, 0.01);
});
test('ERC-free window flips the verdict to the product transfer (£1,049)', () => {
  const r = bev.ptVsRemortgage({ ...ptBase, ptErcFree: true });
  assert.strictEqual(r.pt.erc, 0);
  assert.strictEqual(r.remortgage.erc, 2000); // full remortgage still pays it
  near(r.pt.totalCost, 23000, 0.01);
  assert.strictEqual(r.cheaper, 'pt');
  near(r.savingOverHorizon, 1049, 0.01);
});
test('identical inputs → tie; horizon caps at the remaining term', () => {
  const r = bev.ptVsRemortgage({ ...ptBase, ptRatePct: 4.1, ptFee: 1549, ptErcFree: false });
  assert.strictEqual(r.cheaper, 'tie');
  assert.strictEqual(bev.ptVsRemortgage({ ...ptBase, termMonths: 24 }).horizonMonths, 24);
});
test('repayment mortgages compare on interest, not outgoings', () => {
  // A lower rate must show less interest even though its payment repays
  // more slowly per pound; balances at the end are surfaced for the table.
  const r = bev.ptVsRemortgage({ ...ptBase, repaymentType: 'repayment' });
  assert.ok(r.remortgage.interest < r.pt.interest);
  assert.ok(r.pt.interest > 0 && r.pt.interest < 60 * r.pt.monthlyPayment);
  assert.ok(r.remortgage.balanceEnd < 100000 && r.pt.balanceEnd < 100000);
  assert.strictEqual(r.cheaper, 'remortgage');
});

console.log('notifications — scheduler maths');
// baseMortgage deal ends 2027-03-31; today is 2026-07-05. Hand-computed
// offsets (day-clamped like isoAddMonths):
//   T-6mo 2026-09-30 (Sep has no 31st) · T-3mo 2026-12-31 ·
//   T-1mo 2027-02-28 · T-1wk 2027-03-24 · deal end 2027-03-31.
// Allowance reset (anniversary) falls on the deal-end anniversary =
// 2027-03-31 = deal end itself → deliberately skipped. Future MPC days
// after 2026-07-05: Jul 30, Sep 17, Nov 5, Dec 17 → 4 entries at 6pm.
test('isoAddDays: calendar-exact, month/year boundaries and leap day', () => {
  assert.strictEqual(ntf.isoAddDays('2027-03-31', -7), '2027-03-24');
  assert.strictEqual(ntf.isoAddDays('2026-03-01', -7), '2026-02-22');
  assert.strictEqual(ntf.isoAddDays('2026-01-01', -1), '2025-12-31');
  assert.strictEqual(ntf.isoAddDays('2028-03-01', -1), '2028-02-29'); // leap year
});
test('milestones land at the hand-computed offsets', () => {
  const plan = ntf.plannedNotifications([baseMortgage], TODAY, SNAPSHOT);
  const byKind = Object.fromEntries(plan.filter((n) => n.kind !== 'mpc').map((n) => [n.kind, n.date]));
  assert.deepStrictEqual(byKind, {
    'six-months': '2026-09-30',
    'three-months': '2026-12-31',
    'one-month': '2027-02-28',
    'one-week': '2027-03-24',
    'deal-end': '2027-03-31',
  });
});
test('plan is future-only, date-sorted, with stable ids and 9am milestones', () => {
  const plan = ntf.plannedNotifications([baseMortgage], TODAY, SNAPSHOT);
  assert.strictEqual(plan.length, 9); // 5 milestones + 4 future MPC days
  assert.ok(plan.every((n) => n.date > TODAY));
  const dates = plan.map((n) => n.date);
  assert.deepStrictEqual(dates, [...dates].sort());
  assert.strictEqual(plan[0].id, 'mpc:2026-07-30'); // nearest future entry
  assert.ok(plan.some((n) => n.id === 'm1:deal-end'));
  assert.ok(plan.filter((n) => n.kind !== 'mpc').every((n) => n.hour === 9));
});
test('past milestones are dropped as today advances', () => {
  // By mid-Jan 2027 the 6- and 3-month marks and every 2026 MPC day have
  // passed; only 1-month, 1-week and deal-end remain.
  const plan = ntf.plannedNotifications([baseMortgage], '2027-01-15', SNAPSHOT);
  assert.deepStrictEqual(plan.map((n) => n.kind), ['one-month', 'one-week', 'deal-end']);
});
test('editing the deal date regenerates every offset (reschedule-on-edit)', () => {
  const edited = { ...baseMortgage, dealEndDate: '2027-06-15' };
  const plan = ntf.plannedNotifications([edited], TODAY, SNAPSHOT);
  const byKind = Object.fromEntries(plan.filter((n) => n.kind !== 'mpc').map((n) => [n.kind, n.date]));
  assert.deepStrictEqual(byKind, {
    'six-months': '2026-12-15',
    'three-months': '2027-03-15',
    'one-month': '2027-05-15',
    'one-week': '2027-06-08',
    'deal-end': '2027-06-15',
  });
});
test('MPC entries fire at 6pm and only exist when a mortgage does', () => {
  const plan = ntf.plannedNotifications([baseMortgage], TODAY, SNAPSHOT);
  const mpc = plan.filter((n) => n.kind === 'mpc');
  assert.deepStrictEqual(mpc.map((n) => n.date), ['2026-07-30', '2026-09-17', '2026-11-05', '2026-12-17']);
  assert.ok(mpc.every((n) => n.hour === 18));
  assert.deepStrictEqual(ntf.plannedNotifications([], TODAY, SNAPSHOT), []);
});
test('calendar-mode allowance reset gets its own 1 Jan entry', () => {
  const m = { ...baseMortgage, allowanceReset: 'calendar' };
  const reset = ntf.plannedNotifications([m], TODAY, SNAPSHOT).find((n) => n.kind === 'allowance-reset');
  assert.strictEqual(reset.date, '2027-01-01');
  // anniversary mode coincides with the deal-end day → no duplicate entry
  const anniv = ntf.plannedNotifications([baseMortgage], TODAY, SNAPSHOT);
  assert.ok(!anniv.some((n) => n.kind === 'allowance-reset'));
});
test('revertExtraMonthly: interest-only £100k, 5% → SVR 8% costs £250/mo more', () => {
  // Exact: 100,000 × (8% − 5%) / 12 = £250. Balance never amortises, so the
  // figure is independent of when the deal ends.
  const m = {
    ...baseMortgage, repaymentType: 'interest-only', ratePct: 5,
    monthlyPayment: 416.67, lenderSvrPct: 8,
  };
  near(ntf.revertExtraMonthly(m, SNAPSHOT), 250, 0.01);
});
test('revertExtraMonthly: reverting onto the same rate costs ~nothing', () => {
  // Projecting a correct annuity forward and re-deriving the payment over
  // the remaining term returns the original payment (within pence rounding).
  const m = { ...baseMortgage, lenderSvrPct: 6 };
  near(ntf.revertExtraMonthly(m, SNAPSHOT), 0, 0.05);
});
test('deal-end body carries the £/mo drift figure from the BoE revert rate', () => {
  const dealEnd = ntf.plannedNotifications([baseMortgage], TODAY, SNAPSHOT).find((n) => n.kind === 'deal-end');
  assert.ok(ntf.revertExtraMonthly(baseMortgage, SNAPSHOT) > 0); // 6.6% SVR vs 6% deal
  assert.match(dealEnd.body, /£\d+\/mo more/);
  // no market data and no lender SVR → generic wording, no fabricated number
  const bare = ntf.plannedNotifications([baseMortgage], TODAY, null).find((n) => n.kind === 'deal-end');
  assert.ok(!/£/.test(bare.body));
});

console.log('widgetData — payload builder');
test('payload carries countdown + benchmark for the soonest-ending mortgage', () => {
  const later = { ...baseMortgage, id: 'm2', lender: 'HSBC', dealEndDate: '2028-01-01' };
  const p = wd.widgetPayload([later, baseMortgage], TODAY, SNAPSHOT);
  assert.strictEqual(p.lender, 'Halifax'); // ends 2027-03-31, before m2
  assert.strictEqual(p.dealEndDate, '2027-03-31');
  assert.strictEqual(p.yourRatePct, 6);
  assert.strictEqual(p.benchmarkPct, 4.1); // 2yr fix, 75% band (LTV unknown)
  assert.strictEqual(p.benchmarkAsOf, 'May 2026');
});
test('no market data → rate-only payload; no mortgages → null', () => {
  const p = wd.widgetPayload([baseMortgage], TODAY, null);
  assert.strictEqual(p.benchmarkPct, null);
  assert.strictEqual(p.benchmarkAsOf, null);
  assert.strictEqual(p.yourRatePct, 6);
  assert.strictEqual(wd.widgetPayload([], TODAY, SNAPSHOT), null);
});

console.log('referrals — flags off, FCA-aware');
const testConfig = {
  enabled: true,
  partner: 'tembo',
  url: 'https://partner.example/track?src=rc',
  cta: '',
  placements: {
    'push-landing': true,
    'market-saving': true,
    'breakeven-positive': true,
    'svr-drift': true,
  },
};
test('shipped config renders zero referral links at every placement', () => {
  for (const p of ref.REFERRAL_PLACEMENTS) {
    assert.strictEqual(ref.referralFor(p), null);
    assert.strictEqual(ref.referralFor(p, ref.REFERRAL_CONFIG), null);
  }
  assert.strictEqual(ref.REFERRAL_CONFIG.enabled, false);
  assert.strictEqual(ref.REFERRAL_CONFIG.partner, '');
  assert.ok(Object.values(ref.REFERRAL_CONFIG.placements).every((v) => v === false));
});
test('test flag → CTA with the verbatim risk warning and a placeholder for approved copy', () => {
  const offer = ref.referralFor('market-saving', testConfig);
  assert.strictEqual(offer.partnerName, 'Tembo');
  assert.strictEqual(offer.url, testConfig.url);
  assert.strictEqual(offer.cta, ref.CTA_PLACEHOLDER);
  assert.match(offer.cta, /PLACEHOLDER/);
  assert.strictEqual(
    offer.riskWarning,
    'Your home may be repossessed if you do not keep up repayments on your mortgage.',
  );
});
test('broker-approved copy replaces the placeholder once supplied', () => {
  const offer = ref.referralFor('svr-drift', { ...testConfig, cta: 'Approved partner copy here.' });
  assert.strictEqual(offer.cta, 'Approved partner copy here.');
});
test('partial or malformed config renders nothing', () => {
  assert.strictEqual(ref.referralFor('market-saving', { ...testConfig, url: '' }), null);
  assert.strictEqual(ref.referralFor('market-saving', { ...testConfig, url: 'not a url' }), null);
  assert.strictEqual(ref.referralFor('market-saving', { ...testConfig, url: 'http://insecure.example' }), null);
  assert.strictEqual(ref.referralFor('market-saving', { ...testConfig, partner: '' }), null);
  assert.strictEqual(ref.referralFor('market-saving', { ...testConfig, partner: 'unknown-broker' }), null);
  assert.strictEqual(ref.referralFor('market-saving', { ...testConfig, enabled: false }), null);
  assert.strictEqual(ref.referralFor('market-saving', { ...testConfig, placements: undefined }), null);
  const oneOff = { ...testConfig, placements: { ...testConfig.placements, 'market-saving': false } };
  assert.strictEqual(ref.referralFor('market-saving', oneOff), null);
  assert.ok(ref.referralFor('svr-drift', oneOff)); // other placements unaffected
});
test('click log is newest-first and capped at 200', () => {
  let log = [];
  for (let i = 0; i < 250; i++) {
    log = ref.appendClick(log, { timestamp: i, placement: 'market-saving', partner: 'tembo', url: 'https://x' });
  }
  assert.strictEqual(log.length, ref.MAX_CLICKS);
  assert.strictEqual(ref.MAX_CLICKS, 200);
  assert.strictEqual(log[0].timestamp, 249); // newest first
  assert.strictEqual(log[199].timestamp, 50); // oldest surviving entry
});
test('commission disclosure exists for the About screen and says what it must', () => {
  assert.match(ref.COMMISSION_DISCLOSURE, /commission/i);
  assert.match(ref.COMMISSION_DISCLOSURE, /introducer/i);
  assert.match(ref.COMMISSION_DISCLOSURE, /not.*advi|advice comes from the broker/i);
});

console.log(`\n${passed} tests passed`);
