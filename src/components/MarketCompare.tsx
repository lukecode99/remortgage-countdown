import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { compareToMarket, FIX_OPTIONS, FixYears, MarketSnapshot, svrDrift } from '../market';
import { formatPct, formatPounds, formatPoundsPence } from '../format';
import { colors, radii } from '../theme';
import { Mortgage } from '../types';
import ReferralCta from './ReferralCta';

interface Props {
  m: Mortgage;
  snapshot: MarketSnapshot | null;
  todayIso: string;
}

// The market block on each mortgage card: your rate vs the matching BoE
// benchmark, the recomputed payment, and — inside the final 3 months — what
// lapsing onto the revert rate would cost. Averages, not quotes; the maths
// expands on tap so nothing is a black box.
export default function MarketCompare({ m, snapshot, todayIso }: Props) {
  const [fixYears, setFixYears] = useState<FixYears>(2);
  const [showMaths, setShowMaths] = useState(false);
  const drift = svrDrift(m, snapshot, todayIso);

  if (!snapshot) return null;
  const cmp = compareToMarket(m, snapshot, todayIso, fixYears);
  if (!cmp) return null;

  const saves = cmp.savingMonthly >= 0.5;
  const savingLine = saves
    ? `Switching now could save ~${formatPounds(cmp.savingMonthly)}/mo`
    : cmp.savingMonthly <= -0.5
      ? `A new ${fixYears}yr fix at the average would cost ~${formatPounds(-cmp.savingMonthly)}/mo more`
      : 'Your payment is in line with the market average';

  return (
    <View style={styles.block}>
      <View style={styles.fixRow}>
        {FIX_OPTIONS.map((f) => {
          const active = f === fixYears;
          return (
            <Pressable
              key={f}
              onPress={() => setFixYears(f)}
              style={[styles.fixPill, active ? styles.fixPillActive : null]}
              accessibilityRole="button"
            >
              <Text style={[styles.fixText, active ? styles.fixTextActive : null]}>{f}yr fix</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.headline}>
        Your rate {formatPct(cmp.yourRatePct)} vs typical new {fixYears}yr fix{' '}
        <Text style={{ color: saves ? colors.good : colors.text }}>{formatPct(cmp.benchmarkPct)}</Text>
      </Text>
      <Text style={styles.provenance}>
        {cmp.band}% LTV band · BoE average quoted rate, {cmp.asOfMonth} — not a quote
      </Text>
      {cmp.bandNote ? <Text style={styles.note}>{cmp.bandNote}</Text> : null}
      {cmp.stale ? (
        <Text style={styles.staleWarn}>Data is from {cmp.asOfMonth} and may be out of date.</Text>
      ) : null}

      <Text style={[styles.saving, { color: saves ? colors.good : colors.textDim }]}>{savingLine}</Text>
      {saves && <ReferralCta placement="market-saving" />}

      <Pressable onPress={() => setShowMaths((s) => !s)} accessibilityRole="button">
        <Text style={styles.mathsToggle}>{showMaths ? 'Hide the maths' : 'Show the maths'}</Text>
      </Pressable>
      {showMaths && (
        <View style={styles.maths}>
          <Text style={styles.mathsLine}>Balance today: {formatPounds(cmp.balanceToday)}</Text>
          <Text style={styles.mathsLine}>Remaining term: {cmp.termMonths} months</Text>
          <Text style={styles.mathsLine}>
            Your payment: {formatPoundsPence(cmp.currentPayment)} at {formatPct(cmp.yourRatePct)}
          </Text>
          <Text style={styles.mathsLine}>
            At the {cmp.asOfMonth} average ({formatPct(cmp.benchmarkPct)}, {cmp.label}):{' '}
            {formatPoundsPence(cmp.newPayment)}
          </Text>
          <Text style={styles.mathsLine}>
            Difference: {formatPoundsPence(Math.abs(cmp.savingMonthly))}/mo {saves ? 'less' : 'more'}
          </Text>
          <Text style={styles.mathsFootnote}>
            Standard annuity formula on today's projected balance. Averages of advertised rates — your
            offers will differ. Not advice.
          </Text>
        </View>
      )}

      {drift && (
        <View style={styles.drift}>
          <Text style={styles.driftTitle}>When this deal ends</Text>
          <Text style={styles.driftBody}>
            Without a new deal the balance (~{formatPounds(drift.balanceAtExpiry)}) lapses onto{' '}
            {drift.usingLenderSvr ? 'your lender SVR' : 'the average revert rate'} of{' '}
            {formatPct(drift.revertPct)}
            {drift.asOfMonth ? ` (BoE, ${drift.asOfMonth})` : ''}: {formatPoundsPence(drift.paymentOnRevert)}
            /mo — {formatPounds(Math.abs(drift.extraMonthly))}/mo {drift.extraMonthly >= 0 ? 'more' : 'less'}{' '}
            than now.
          </Text>
          <ReferralCta placement="svr-drift" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { marginTop: 14, borderTopWidth: 1, borderTopColor: colors.cardBorder, paddingTop: 12 },
  fixRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  fixPill: {
    borderColor: colors.cardBorder,
    borderWidth: 1,
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  fixPillActive: { backgroundColor: colors.accentDark, borderColor: colors.accent },
  fixText: { color: colors.textDim, fontSize: 12 },
  fixTextActive: { color: colors.text, fontWeight: '600' },
  headline: { color: colors.text, fontSize: 15, fontWeight: '700' },
  provenance: { color: colors.textDim, fontSize: 12, marginTop: 3 },
  note: { color: colors.textDim, fontSize: 12, marginTop: 3, fontStyle: 'italic' },
  staleWarn: { color: colors.warn, fontSize: 12, marginTop: 3 },
  saving: { fontSize: 14, fontWeight: '600', marginTop: 8 },
  mathsToggle: { color: colors.accent, fontSize: 13, marginTop: 8 },
  maths: {
    backgroundColor: colors.inputBg,
    borderRadius: radii.card,
    padding: 12,
    marginTop: 8,
  },
  mathsLine: { color: colors.text, fontSize: 13, marginBottom: 3 },
  mathsFootnote: { color: colors.textDim, fontSize: 11, marginTop: 6, lineHeight: 15 },
  drift: {
    backgroundColor: colors.accentDark,
    borderColor: colors.warn,
    borderWidth: 1,
    borderRadius: radii.card,
    padding: 12,
    marginTop: 10,
  },
  driftTitle: { color: colors.warn, fontSize: 13, fontWeight: '700', marginBottom: 4 },
  driftBody: { color: colors.text, fontSize: 13, lineHeight: 18 },
});
