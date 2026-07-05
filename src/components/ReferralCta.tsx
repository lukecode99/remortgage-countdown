import React from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { ReferralPlacement, referralFor } from '../referrals';
import { logReferralClick } from '../storage';
import { colors, radii } from '../theme';

interface Props {
  placement: ReferralPlacement;
}

// A referral CTA (s21 financial promotion) for one placement. Renders
// nothing at all with the shipped config — referralFor() is null unless the
// placement is explicitly enabled with a valid partner. When it does render,
// the copy is the broker-approved creative (or an unmistakable placeholder
// under a test flag) and the risk warning is always attached.
export default function ReferralCta({ placement }: Props) {
  const offer = referralFor(placement);
  if (!offer) return null;

  const open = () => {
    logReferralClick({
      timestamp: Date.now(),
      placement: offer.placement,
      partner: offer.partner,
      url: offer.url,
    }).catch(() => {});
    Linking.openURL(offer.url).catch(() => {});
  };

  return (
    <View style={styles.block}>
      <Text style={styles.cta}>{offer.cta}</Text>
      <Pressable style={styles.button} onPress={open} accessibilityRole="button">
        <Text style={styles.buttonText}>Continue to {offer.partnerName}</Text>
      </Pressable>
      <Text style={styles.risk}>{offer.riskWarning}</Text>
      <Text style={styles.disclosure}>We may receive a commission — see About for details.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    backgroundColor: colors.inputBg,
    borderColor: colors.cardBorder,
    borderWidth: 1,
    borderRadius: radii.card,
    padding: 12,
    marginTop: 10,
  },
  cta: { color: colors.text, fontSize: 13, lineHeight: 18 },
  button: {
    backgroundColor: colors.accentDark,
    borderColor: colors.accent,
    borderWidth: 1,
    borderRadius: radii.pill,
    paddingVertical: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: { color: colors.text, fontSize: 13, fontWeight: '700' },
  risk: { color: colors.warn, fontSize: 11, fontWeight: '600', marginTop: 8, lineHeight: 15 },
  disclosure: { color: colors.textDim, fontSize: 10, marginTop: 4 },
});
