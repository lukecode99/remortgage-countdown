import React from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { countdown, currentBalance, ercPctNow, ltvPct } from '../amortisation';
import {
  formatDate,
  formatDays,
  formatMonthsDays,
  formatPct,
  formatPounds,
  formatPoundsPence,
  formatTerm,
} from '../format';
import { colors, radii } from '../theme';
import { MAX_MORTGAGES, Mortgage } from '../types';

interface Props {
  mortgages: Mortgage[];
  todayIso: string;
  onAdd: () => void;
  onEdit: (m: Mortgage) => void;
  onDelete: (m: Mortgage) => void;
}

function confirmDelete(m: Mortgage, onDelete: (m: Mortgage) => void) {
  if (Platform.OS === 'web') {
    // eslint-disable-next-line no-alert
    if (typeof globalThis.confirm === 'function' && globalThis.confirm(`Delete ${m.lender}?`)) onDelete(m);
    return;
  }
  Alert.alert('Delete mortgage', `Remove ${m.lender} from the app? This can't be undone.`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: () => onDelete(m) },
  ]);
}

function ltvColor(pct: number): string {
  if (pct < 60) return colors.good;
  if (pct <= 80) return colors.warn;
  return colors.bad;
}

function MortgageCard({ m, todayIso, onEdit, onDelete }: { m: Mortgage; todayIso: string; onEdit: Props['onEdit']; onDelete: Props['onDelete'] }) {
  const cd = countdown(todayIso, m.dealEndDate);
  const balance = currentBalance(m, todayIso);
  const ltv = ltvPct(balance, m.propertyValue);
  const erc = ercPctNow(m, todayIso);
  const urgent = cd.days <= 90;

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.lender}>{m.lender}</Text>
        {ltv !== null && (
          <View style={[styles.badge, { borderColor: ltvColor(ltv) }]}>
            <Text style={[styles.badgeText, { color: ltvColor(ltv) }]}>LTV {formatPct(ltv)}</Text>
          </View>
        )}
      </View>

      <Text style={[styles.days, urgent ? styles.daysUrgent : null]}>{formatDays(cd.days)}</Text>
      {cd.days > 0 && (
        <Text style={styles.until}>
          {formatMonthsDays(cd.months, cd.remDays)} until {formatDate(m.dealEndDate)}
        </Text>
      )}
      {cd.days <= 0 && <Text style={[styles.until, { color: colors.bad }]}>Deal ended {formatDate(m.dealEndDate)} — likely on SVR</Text>}

      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>Balance today</Text>
          <Text style={styles.statValue}>{formatPounds(balance)}</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>Payment</Text>
          <Text style={styles.statValue}>{formatPoundsPence(m.monthlyPayment)}</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>Rate</Text>
          <Text style={styles.statValue}>{formatPct(m.ratePct)}</Text>
        </View>
      </View>

      <Text style={styles.meta}>
        {m.repaymentType === 'repayment' ? 'Repayment' : 'Interest-only'} · {formatTerm(m.remainingTermMonths)} left
        {erc !== null ? ` · ERC now ${formatPct(erc)}` : ''}
        {m.paymentDerived ? ' · payment estimated' : ''}
      </Text>

      <View style={styles.cardButtons}>
        <Pressable style={styles.cardBtn} onPress={() => onEdit(m)} accessibilityRole="button">
          <Text style={styles.cardBtnText}>Edit</Text>
        </Pressable>
        <Pressable style={styles.cardBtn} onPress={() => confirmDelete(m, onDelete)} accessibilityRole="button">
          <Text style={[styles.cardBtnText, { color: colors.bad }]}>Delete</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function DashboardScreen({ mortgages, todayIso, onAdd, onEdit, onDelete }: Props) {
  const sorted = [...mortgages].sort((a, b) => a.dealEndDate.localeCompare(b.dealEndDate));
  const atCap = mortgages.length >= MAX_MORTGAGES;

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.scroll}>
      <Text style={styles.title}>Remortgage Countdown</Text>

      {sorted.length === 0 && (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No mortgages yet</Text>
          <Text style={styles.emptyBody}>
            Add your mortgage to see a live countdown to the end of your deal, your projected balance and your LTV.
          </Text>
        </View>
      )}

      {sorted.map((m) => (
        <MortgageCard key={m.id} m={m} todayIso={todayIso} onEdit={onEdit} onDelete={onDelete} />
      ))}

      <Pressable
        style={[styles.add, atCap ? styles.addDisabled : null]}
        onPress={atCap ? undefined : onAdd}
        accessibilityRole="button"
      >
        <Text style={styles.addText}>{atCap ? `Maximum of ${MAX_MORTGAGES} mortgages` : '+ Add a mortgage'}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: 20, paddingBottom: 48 },
  title: { color: colors.text, fontSize: 24, fontWeight: '700', marginBottom: 16 },
  empty: {
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderWidth: 1,
    borderRadius: radii.card,
    padding: 20,
    marginBottom: 16,
  },
  emptyTitle: { color: colors.text, fontSize: 17, fontWeight: '700', marginBottom: 6 },
  emptyBody: { color: colors.textDim, fontSize: 14, lineHeight: 20 },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderWidth: 1,
    borderRadius: radii.card,
    padding: 18,
    marginBottom: 14,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  lender: { color: colors.text, fontSize: 16, fontWeight: '700' },
  badge: { borderWidth: 1, borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 3 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  days: { color: colors.accent, fontSize: 40, fontWeight: '800', marginTop: 10 },
  daysUrgent: { color: colors.warn },
  until: { color: colors.textDim, fontSize: 13, marginTop: 2 },
  statsRow: { flexDirection: 'row', marginTop: 14, gap: 12 },
  stat: { flex: 1 },
  statLabel: { color: colors.textDim, fontSize: 12 },
  statValue: { color: colors.text, fontSize: 15, fontWeight: '700', marginTop: 2 },
  meta: { color: colors.textDim, fontSize: 12, marginTop: 12 },
  cardButtons: { flexDirection: 'row', gap: 10, marginTop: 12 },
  cardBtn: {
    borderColor: colors.cardBorder,
    borderWidth: 1,
    borderRadius: radii.pill,
    paddingHorizontal: 16,
    paddingVertical: 7,
  },
  cardBtnText: { color: colors.text, fontSize: 13, fontWeight: '600' },
  add: {
    backgroundColor: colors.accentDark,
    borderColor: colors.accent,
    borderWidth: 1,
    borderRadius: radii.card,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  addDisabled: { opacity: 0.5 },
  addText: { color: colors.text, fontSize: 15, fontWeight: '700' },
});
