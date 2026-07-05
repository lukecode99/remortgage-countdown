import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ercPctNow } from '../amortisation';
import Field from '../components/Field';
import Pills from '../components/Pills';
import ReferralCta from '../components/ReferralCta';
import { formatPct, formatPounds, formatPoundsPence } from '../format';
import { compareToMarket, MarketSnapshot, monthLabel } from '../market';
import { ercAmountNow, ercBreakEvenFrom, FEE_DEFAULTS, OptionCost, ptVsRemortgage } from '../breakeven';
import { effectiveBalance } from '../overpay';
import { colors, radii } from '../theme';
import { Mortgage } from '../types';
import { num } from '../wizard';

interface Props {
  m: Mortgage;
  market: MarketSnapshot | null;
  todayIso: string;
  onBack: () => void;
}

/** Rate input with −/+ 0.1 steppers — the "slider" over the target rate. */
function RateField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const step = (delta: number) => {
    const v = num(value);
    if (v === null) return;
    onChange(String(Math.round(Math.max(0, v + delta) * 100) / 100));
  };
  return (
    <View style={styles.rateRow}>
      <View style={styles.rateField}>
        <Field label={label} value={value} onChange={onChange} keyboardType="decimal-pad" placeholder="e.g. 4.1" />
      </View>
      <Pressable style={styles.step} onPress={() => step(-0.1)} accessibilityRole="button">
        <Text style={styles.stepText}>−</Text>
      </Pressable>
      <Pressable style={styles.step} onPress={() => step(0.1)} accessibilityRole="button">
        <Text style={styles.stepText}>+</Text>
      </Pressable>
    </View>
  );
}

function CostColumn({ title, o }: { title: string; o: OptionCost }) {
  return (
    <View style={styles.col}>
      <Text style={styles.colTitle}>{title}</Text>
      <Text style={styles.colRate}>{formatPct(o.ratePct)}</Text>
      <Text style={styles.colLabel}>Fees</Text>
      <Text style={styles.colValue}>{formatPounds(o.fees)}</Text>
      <Text style={styles.colLabel}>ERC</Text>
      <Text style={styles.colValue}>{formatPounds(o.erc)}</Text>
      <Text style={styles.colLabel}>Payment</Text>
      <Text style={styles.colValue}>{formatPoundsPence(o.monthlyPayment)}</Text>
      <Text style={styles.colLabel}>Interest</Text>
      <Text style={styles.colValue}>{formatPounds(o.interest)}</Text>
      <Text style={styles.colLabel}>Balance at end</Text>
      <Text style={styles.colValue}>{formatPounds(o.balanceEnd)}</Text>
      <View style={styles.colTotalRule} />
      <Text style={styles.colLabel}>Total cost</Text>
      <Text style={styles.colTotal}>{formatPounds(o.totalCost)}</Text>
    </View>
  );
}

export default function SwitchScreen({ m, market, todayIso, onBack }: Props) {
  const balance = effectiveBalance(m, todayIso);
  const benchmark = market ? compareToMarket(m, market, todayIso, 2) : null;
  const prefillRate = benchmark ? String(benchmark.benchmarkPct) : '';

  // ERC break-even
  const [targetRate, setTargetRate] = useState(prefillRate);
  const [ercStr, setErcStr] = useState(String(Math.round(ercAmountNow(m, todayIso))));
  const [arrangement, setArrangement] = useState(String(FEE_DEFAULTS.arrangement));
  const [legals, setLegals] = useState(String(FEE_DEFAULTS.legals));
  const [valuation, setValuation] = useState(String(FEE_DEFAULTS.valuation));

  // PT vs remortgage
  const [ptRate, setPtRate] = useState('');
  const [ptFee, setPtFee] = useState('0');
  const [remoRate, setRemoRate] = useState(prefillRate);
  const [ercFree, setErcFree] = useState<'yes' | 'no'>('no');

  const erc = num(ercStr) ?? 0;
  const fees = (num(arrangement) ?? 0) + (num(legals) ?? 0) + (num(valuation) ?? 0);
  const targetN = num(targetRate);
  const be = targetN !== null && targetN >= 0 ? ercBreakEvenFrom(m, todayIso, targetN, erc, fees) : null;

  const ptN = num(ptRate);
  const remoN = num(remoRate);
  const pt =
    ptN !== null && remoN !== null && ptN >= 0 && remoN >= 0
      ? ptVsRemortgage({
          balanceToday: balance,
          termMonths: m.remainingTermMonths,
          repaymentType: m.repaymentType,
          ptRatePct: ptN,
          ptFee: num(ptFee) ?? 0,
          remoRatePct: remoN,
          remoFees: fees,
          ercAmount: erc,
          ptErcFree: ercFree === 'yes',
        })
      : null;

  const ercPct = ercPctNow(m, todayIso);

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.flex} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Switching costs — {m.lender}</Text>
        <Text style={styles.subtitle}>
          Balance today {formatPounds(balance)} at {formatPct(m.ratePct)}
          {ercPct !== null ? ` · ERC in force ${formatPct(ercPct)}` : ' · no ERC in force'}
        </Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Would switching early pay off?</Text>
          <Text style={styles.meta}>
            Leaving the deal costs the ERC plus remortgage fees. The monthly saving at the new rate pays
            that back over time — this is when you'd be quits. Simple payback maths; edit anything below.
          </Text>
          <RateField label="New rate you could get (%)" value={targetRate} onChange={setTargetRate} />
          {benchmark && (
            <Text style={styles.provenance}>
              Pre-filled from the BoE average 2yr fix, {benchmark.band}% LTV band, {benchmark.asOfMonth} — not a quote
            </Text>
          )}
          <Field label="ERC to leave now (£)" value={ercStr} onChange={setErcStr} keyboardType="decimal-pad" />
          <Field label="Arrangement fee (£)" value={arrangement} onChange={setArrangement} keyboardType="decimal-pad" />
          <Field label="Legal fees (£)" value={legals} onChange={setLegals} keyboardType="decimal-pad" />
          <Field label="Valuation (£)" value={valuation} onChange={setValuation} keyboardType="decimal-pad" />
          {be && (
            <View style={styles.result}>
              {be.months === null ? (
                <Text style={styles.resultBad}>
                  No monthly saving at {formatPct(targetN as number)} — your payment would be{' '}
                  {formatPoundsPence(be.newPayment)} vs {formatPoundsPence(m.monthlyPayment)} now, so the{' '}
                  {formatPounds(be.upfrontCost)} cost never pays back.
                </Text>
              ) : (
                <>
                  <Text style={styles.resultHeadline}>
                    Breaks even in {be.months} month{be.months === 1 ? '' : 's'}
                  </Text>
                  <Text style={styles.resultDetail}>
                    {formatPounds(be.upfrontCost)} up front (ERC {formatPounds(erc)} + fees {formatPounds(fees)}),
                    recovered at {formatPoundsPence(be.monthlySaving)}/month.
                    {be.worthItAfter ? ` Worth it if you'll stay past ${monthLabel(be.worthItAfter)}.` : ''}
                  </Text>
                  <ReferralCta placement="breakeven-positive" />
                </>
              )}
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Product transfer vs full remortgage</Text>
          <Text style={styles.meta}>
            A product transfer (staying with {m.lender}) has no legal or valuation fees and lenders often
            waive the ERC in the final 3–6 months. A full remortgage can reach better rates but pays the
            fees above. Costs over {pt ? Math.round(pt.horizonMonths / 12) : 5} years, side by side.
          </Text>
          <RateField label={`Product-transfer rate from ${m.lender} (%)`} value={ptRate} onChange={setPtRate} />
          <Field label="Product-transfer fee (£)" value={ptFee} onChange={setPtFee} keyboardType="decimal-pad" />
          <RateField label="Best full-remortgage rate (%)" value={remoRate} onChange={setRemoRate} />
          <Text style={styles.label}>ERC-free window applies to the transfer?</Text>
          <Pills options={['no', 'yes']} selected={ercFree} onSelect={(v) => setErcFree(v as 'yes' | 'no')} />
          {pt && (
            <>
              <View style={styles.table}>
                <CostColumn title="Product transfer" o={pt.pt} />
                <CostColumn title="Remortgage" o={pt.remortgage} />
              </View>
              <View style={styles.result}>
                <Text style={styles.resultHeadline}>
                  {pt.cheaper === 'tie'
                    ? `Same cost over ${Math.round(pt.horizonMonths / 12)} years`
                    : `${pt.cheaper === 'pt' ? 'The product transfer' : 'The full remortgage'} is cheaper over ${Math.round(pt.horizonMonths / 12)} years by ${formatPounds(pt.savingOverHorizon)}`}
                </Text>
                <Text style={styles.resultDetail}>
                  Cost = fees + ERC + interest accrued. Rates and fees are your inputs, not offers — check
                  what your lender will actually give you. Not advice.
                </Text>
              </View>
            </>
          )}
        </View>

        <Pressable style={styles.back} onPress={onBack} accessibilityRole="button">
          <Text style={styles.backText}>Back to dashboard</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: 20, paddingBottom: 48 },
  title: { color: colors.text, fontSize: 24, fontWeight: '700' },
  subtitle: { color: colors.textDim, fontSize: 13, marginTop: 4, marginBottom: 16 },
  section: {
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderWidth: 1,
    borderRadius: radii.card,
    padding: 16,
    marginBottom: 14,
  },
  sectionTitle: { color: colors.text, fontSize: 16, fontWeight: '700', marginBottom: 8 },
  meta: { color: colors.textDim, fontSize: 12, lineHeight: 17, marginBottom: 12 },
  provenance: { color: colors.textDim, fontSize: 11, marginTop: -8, marginBottom: 12 },
  label: { color: colors.textDim, fontSize: 13, marginBottom: 6, fontWeight: '600' },
  rateRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  rateField: { flex: 1 },
  step: {
    borderColor: colors.cardBorder,
    borderWidth: 1,
    borderRadius: radii.card,
    backgroundColor: colors.inputBg,
    width: 44,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 25,
  },
  stepText: { color: colors.accent, fontSize: 18, fontWeight: '700' },
  result: { backgroundColor: colors.inputBg, borderRadius: radii.card, padding: 12, marginTop: 8 },
  resultHeadline: { color: colors.good, fontSize: 15, fontWeight: '700' },
  resultDetail: { color: colors.textDim, fontSize: 13, marginTop: 4, lineHeight: 18 },
  resultBad: { color: colors.warn, fontSize: 13, lineHeight: 18 },
  table: { flexDirection: 'row', gap: 10, marginTop: 12 },
  col: {
    flex: 1,
    backgroundColor: colors.inputBg,
    borderRadius: radii.card,
    padding: 12,
  },
  colTitle: { color: colors.text, fontSize: 13, fontWeight: '700' },
  colRate: { color: colors.accent, fontSize: 18, fontWeight: '800', marginTop: 2, marginBottom: 8 },
  colLabel: { color: colors.textDim, fontSize: 11, marginTop: 6 },
  colValue: { color: colors.text, fontSize: 14, fontWeight: '600' },
  colTotalRule: { borderTopColor: colors.cardBorder, borderTopWidth: 1, marginTop: 10 },
  colTotal: { color: colors.text, fontSize: 16, fontWeight: '800' },
  back: {
    borderColor: colors.cardBorder,
    borderWidth: 1,
    borderRadius: radii.card,
    paddingVertical: 14,
    alignItems: 'center',
  },
  backText: { color: colors.text, fontSize: 15, fontWeight: '600' },
});
