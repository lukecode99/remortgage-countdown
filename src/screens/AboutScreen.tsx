import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { COMMISSION_DISCLOSURE, RISK_WARNING } from '../referrals';
import { colors, radii } from '../theme';

interface Props {
  onBack: () => void;
}

// About & disclosures — plain statements of what the app is and is not.
// The commission disclosure (introducer hygiene, RM-7) lives here.
export default function AboutScreen({ onBack }: Props) {
  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.scroll}>
      <Pressable onPress={onBack} accessibilityRole="button">
        <Text style={styles.back}>‹ Back</Text>
      </Pressable>
      <Text style={styles.title}>About</Text>

      <Text style={styles.heading}>What this app is</Text>
      <Text style={styles.body}>
        Remortgage Countdown keeps track of when your mortgage deal ends and shows generic
        arithmetic about it: projected balance, loan-to-value, what the maths of overpaying or
        switching looks like. Everything stays on your device — no accounts, no ads, no tracking.
      </Text>

      <Text style={styles.heading}>What this app is not</Text>
      <Text style={styles.body}>
        Nothing here is financial advice or a recommendation of any product or lender. Market
        figures are Bank of England averages of advertised rates, labelled with their month —
        your actual offers will differ. Projections are estimates on the standard monthly
        compounding basis, not statements of what you owe.
      </Text>

      <Text style={styles.heading}>Commission disclosure</Text>
      <Text style={styles.body}>{COMMISSION_DISCLOSURE}</Text>
      <Text style={styles.risk}>{RISK_WARNING}</Text>

      <Text style={styles.heading}>Data sources</Text>
      <Text style={styles.body}>
        Benchmark rates: Bank of England Interactive Statistical Database, via our own cache.
        Bank Rate decision dates: the Bank's published MPC calendar. Your mortgage details never
        leave the device.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: 20, paddingBottom: 48 },
  back: { color: colors.accent, fontSize: 15, marginBottom: 10 },
  title: { color: colors.text, fontSize: 24, fontWeight: '700', marginBottom: 6 },
  heading: { color: colors.text, fontSize: 15, fontWeight: '700', marginTop: 16, marginBottom: 4 },
  body: { color: colors.textDim, fontSize: 13, lineHeight: 19 },
  risk: {
    color: colors.warn,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 17,
    marginTop: 10,
    backgroundColor: colors.inputBg,
    borderRadius: radii.card,
    padding: 10,
  },
});
