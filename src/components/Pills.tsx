import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { colors, radii } from '../theme';

interface Props {
  options: readonly string[];
  selected?: string;
  onSelect: (v: string) => void;
}

export default function Pills({ options, selected, onSelect }: Props) {
  return (
    <View style={styles.row}>
      {options.map((o) => {
        const active = o === selected;
        return (
          <Pressable
            key={o}
            onPress={() => { Haptics.selectionAsync(); onSelect(o); }}
            style={[styles.pill, active ? styles.pillActive : null]}
            accessibilityRole="button"
          >
            <Text style={[styles.text, active ? styles.textActive : null]}>{o}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: {
    borderColor: colors.cardBorder,
    borderWidth: 1,
    borderRadius: radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: colors.card,
  },
  pillActive: { backgroundColor: colors.accentDark, borderColor: colors.accent },
  text: { color: colors.textDim, fontSize: 13 },
  textActive: { color: colors.text, fontWeight: '600' },
});
