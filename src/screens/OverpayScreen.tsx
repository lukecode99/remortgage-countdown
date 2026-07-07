import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Field from '../components/Field';
import Pills from '../components/Pills';
import { formatDate, formatPounds, formatPoundsPence, formatPct } from '../format';
import {
  addOverpayment,
  allowanceStatus,
  DEFAULT_ALLOWANCE_PCT,
  effectiveBalance,
  overpaymentImpact,
  overpayVsSave,
  removeOverpayment,
  TaxBand,
  wouldBreachAllowance,
} from '../overpay';
import { colors, radii } from '../theme';
import { Mortgage } from '../types';
import { num } from '../wizard';

interface Props {
  m: Mortgage;
  todayIso: string;
  onUpdate: (m: Mortgage) => void;
  onBack: () => void;
}

const TAX_LABELS: Record<string, TaxBand> = { 'basic rate': 'basic', 'higher rate': 'higher', 'ISA': 'isa' };

export default function OverpayScreen({ m, todayIso, onUpdate, onBack }: Props) {
  // Instant impact (what-if — nothing is saved)
  const [oneOff, setOneOff] = useState('');
  const [recurring, setRecurring] = useState('');
  // Allowance tracker
  const [logAmount, setLogAmount] = useState('');
  const [logError, setLogError] = useState<string | undefined>();
  const [breachPending, setBreachPending] = useState(false);
  // Overpay vs save
  const [savingsRate, setSavingsRate] = useState('');
  const [taxLabel, setTaxLabel] = useState('basic rate');

  const balance = effectiveBalance(m, todayIso);

  const oneOffN = num(oneOff) ?? 0;
  const recurringN = num(recurring) ?? 0;
  const impact =
    oneOffN > 0 || recurringN > 0
      ? overpaymentImpact(balance, m.ratePct, m.monthlyPayment, m.remainingTermMonths, m.repaymentType, oneOffN, recurringN)
      : null;

  const allowance = allowanceStatus(m, todayIso);

  const logIt = () => {
    const amount = num(logAmount);
    if (amount === null || amount <= 0) {
      setLogError('Enter the amount you overpaid');
      return;
    }
    setLogError(undefined);
    if (wouldBreachAllowance(m, todayIso, amount) && !breachPending) {
      setBreachPending(true); // warn once; a second tap logs anyway
      return;
    }
    setBreachPending(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const overpayments = addOverpayment(m.overpayments, {
      id: `op_${m.overpayments?.length ?? 0}_${todayIso}`,
      date: todayIso,
      amount,
    });
    onUpdate({ ...m, overpayments });
    setLogAmount('');
  };

  const setAllowancePct = (v: string) => {
    const pct = num(v);
    if (pct !== null && pct > 0 && pct <= 100) onUpdate({ ...m, allowancePct: pct });
  };

  const savingsN = num(savingsRate);
  const vs = savingsN !== null && savingsN >= 0 ? overpayVsSave(m.ratePct, savingsN, TAX_LABELS[taxLabel]) : null;

  const ops = [...(m.overpayments ?? [])].reverse();

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.flex} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Overpayments — {m.lender}</Text>
        <Text style={styles.subtitle}>Balance today {formatPounds(balance)} at {formatPct(m.ratePct)}</Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>What would an overpayment do?</Text>
          <Field
            label="One-off amount (£)"
            value={oneOff}
            onChange={setOneOff}
            placeholder="e.g. 5000"
            keyboardType="decimal-pad"
          />
          <Field
            label="Extra every month (£)"
            value={recurring}
            onChange={setRecurring}
            placeholder="e.g. 100"
            keyboardType="decimal-pad"
          />
          {impact && (
            <View style={styles.impact}>
              <Text style={styles.impactHeadline}>
                Saves {formatPounds(impact.interestSaved)} interest
                {impact.monthsCut > 0
                  ? `, cuts ${impact.monthsCut} month${impact.monthsCut === 1 ? '' : 's'}`
                  : ''}
              </Text>
              <Text style={styles.impactDetail}>
                {m.repaymentType === 'repayment'
                  ? `Paid off in ${impact.newMonths} months instead of ${impact.baselineMonths}. Total interest ${formatPounds(impact.newInterest)} instead of ${formatPounds(impact.baselineInterest)}.`
                  : `Interest over the remaining term drops to ${formatPounds(impact.newInterest)} from ${formatPounds(impact.baselineInterest)}.`}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Allowance tracker</Text>
          <Text style={styles.allowanceLine}>
            {formatPounds(allowance.used)} of {formatPounds(allowance.limit)} used —{' '}
            <Text style={{ color: allowance.left > 0 ? colors.good : colors.bad, fontWeight: '700' }}>
              {formatPounds(allowance.left)} left
            </Text>
            , resets {formatDate(allowance.resetDate)}
          </Text>
          <Text style={styles.allowanceMeta}>
            {allowance.allowancePct}% of the balance at the start of the allowance year. Most lenders allow{' '}
            {DEFAULT_ALLOWANCE_PCT}% — check yours.
          </Text>
          <Field
            label={`Allowance (%) — ${m.allowanceReset === 'calendar' ? 'resets 1 Jan' : 'resets on the deal anniversary'}`}
            value={String(allowance.allowancePct)}
            onChange={setAllowancePct}
            keyboardType="decimal-pad"
          />
          <Pills
            options={['anniversary', 'calendar']}
            selected={m.allowanceReset ?? 'anniversary'}
            onSelect={(v) => onUpdate({ ...m, allowanceReset: v as Mortgage['allowanceReset'] })}
          />
          <View style={styles.gap} />
          <Field
            label="Log an overpayment made today (£)"
            value={logAmount}
            onChange={(v) => {
              setLogAmount(v);
              setBreachPending(false);
            }}
            placeholder="e.g. 2000"
            keyboardType="decimal-pad"
            error={logError}
          />
          {breachPending && (
            <Text style={styles.breach}>
              This would take you over the {formatPounds(allowance.limit)} allowance — early repayment
              charges may apply. Tap Log again to record it anyway.
            </Text>
          )}
          <Pressable style={styles.logBtn} onPress={logIt} accessibilityRole="button">
            <Text style={styles.logBtnText}>Log overpayment</Text>
          </Pressable>
          {ops.map((o) => (
            <View key={o.id} style={styles.opRow}>
              <Text style={styles.opText}>
                {formatDate(o.date)} — {formatPoundsPence(o.amount)}
              </Text>
              <Pressable onPress={() => onUpdate({ ...m, overpayments: removeOverpayment(m.overpayments, o.id) })}>
                <Text style={styles.opRemove}>Remove</Text>
              </Pressable>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Overpay or save?</Text>
          <Text style={styles.allowanceMeta}>
            Overpaying "earns" your mortgage rate, guaranteed and tax-free. Compare it with your best
            savings rate after tax (assumes savings interest above your Personal Savings Allowance).
          </Text>
          <Field
            label="Best savings rate you can get (% a year)"
            value={savingsRate}
            onChange={setSavingsRate}
            placeholder="e.g. 4.5"
            keyboardType="decimal-pad"
          />
          <Pills options={Object.keys(TAX_LABELS)} selected={taxLabel} onSelect={setTaxLabel} />
          {vs && (
            <View style={styles.impact}>
              <Text style={styles.impactHeadline}>
                {vs.verdict === 'overpay'
                  ? 'Overpaying wins'
                  : vs.verdict === 'save'
                    ? 'Saving wins'
                    : 'Dead heat'}
              </Text>
              <Text style={styles.impactDetail}>
                Mortgage {formatPct(vs.mortgageRatePct)} vs savings {formatPct(vs.savingsRatePct)} ={' '}
                {formatPct(vs.postTaxSavingsPct)} after tax. Not advice — check ERCs before overpaying.
              </Text>
            </View>
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
  sectionTitle: { color: colors.text, fontSize: 16, fontWeight: '700', marginBottom: 10 },
  impact: { backgroundColor: colors.inputBg, borderRadius: radii.card, padding: 12, marginTop: 4 },
  impactHeadline: { color: colors.good, fontSize: 15, fontWeight: '700' },
  impactDetail: { color: colors.textDim, fontSize: 13, marginTop: 4, lineHeight: 18 },
  allowanceLine: { color: colors.text, fontSize: 14, lineHeight: 20 },
  allowanceMeta: { color: colors.textDim, fontSize: 12, marginTop: 4, marginBottom: 10, lineHeight: 17 },
  gap: { height: 12 },
  breach: { color: colors.warn, fontSize: 13, marginBottom: 8, lineHeight: 18 },
  logBtn: {
    backgroundColor: colors.accentDark,
    borderColor: colors.accent,
    borderWidth: 1,
    borderRadius: radii.card,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 8,
  },
  logBtnText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  opRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  opText: { color: colors.text, fontSize: 13 },
  opRemove: { color: colors.bad, fontSize: 13 },
  back: {
    borderColor: colors.cardBorder,
    borderWidth: 1,
    borderRadius: radii.card,
    paddingVertical: 14,
    alignItems: 'center',
  },
  backText: { color: colors.text, fontSize: 15, fontWeight: '600' },
});
