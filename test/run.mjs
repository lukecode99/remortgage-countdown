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
for (const mod of ['amortisation', 'format', 'wizard']) {
  execSync(
    `npx esbuild src/${mod}.ts --bundle --format=esm --platform=node --outfile=${join(outDir, mod + '.mjs')}`,
    { cwd: root, stdio: 'pipe' },
  );
}
const am = await import(join(outDir, 'amortisation.mjs'));
const fmt = await import(join(outDir, 'format.mjs'));
const wiz = await import(join(outDir, 'wizard.mjs'));

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
  const r = wiz.validateWizard({ ...goodForm(), erc: '3, 2', propertyValue: '310000' }, TODAY);
  const m = { ...r.draft, id: 'x', balanceAsOf: TODAY, createdAt: 't', updatedAt: 't' };
  const f = wiz.formFromMortgage(m);
  const r2 = wiz.validateWizard(f, TODAY);
  assert.ok(r2.ok);
  assert.deepStrictEqual(r2.draft, r.draft);
});

console.log(`\n${passed} tests passed`);
