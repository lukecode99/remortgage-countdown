import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Field from '../components/Field';
import Pills from '../components/Pills';
import { formatPoundsPence } from '../format';
import { derivePayment } from '../amortisation';
import { colors, radii } from '../theme';
import { COMMON_LENDERS, Mortgage } from '../types';
import { emptyForm, formFromMortgage, MortgageDraft, validateWizard, WizardForm } from '../wizard';

interface Props {
  editing: Mortgage | null;
  todayIso: string;
  onSave: (draft: MortgageDraft) => void;
  onCancel: () => void;
}

const STEPS = ['The loan', 'The dates', 'Extras'] as const;

export default function WizardScreen({ editing, todayIso, onSave, onCancel }: Props) {
  const [form, setForm] = useState<WizardForm>(editing ? formFromMortgage(editing) : emptyForm());
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<ReturnType<typeof validateWizard>['errors']>({});
  const [warning, setWarning] = useState<string | undefined>();

  const set = (k: keyof WizardForm) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  // Validate everything, but only surface errors for fields on this step.
  const stepFields: (keyof WizardForm)[][] = [
    ['lender', 'balance', 'ratePct', 'monthlyPayment'],
    ['dealEndDay', 'dealEndMonth', 'dealEndYear', 'termYears', 'termMonths'],
    ['propertyValue', 'erc', 'lenderSvr'],
  ];

  const next = () => {
    const result = validateWizard(form, todayIso);
    const relevant = Object.fromEntries(
      Object.entries(result.errors).filter(([k]) => stepFields[step].includes(k as keyof WizardForm)),
    );
    if (Object.keys(relevant).length > 0) {
      setErrors(relevant);
      return;
    }
    setErrors({});
    if (step < STEPS.length - 1) {
      setStep(step + 1);
      return;
    }
    if (!result.ok || !result.draft) {
      setErrors(result.errors); // stray error on an earlier step
      return;
    }
    setWarning(result.warning);
    if (result.warning && !warning) return; // show the warning once; next tap confirms
    onSave(result.draft);
  };

  const derivedPreview = (() => {
    if (form.monthlyPayment.trim() !== '') return null;
    const result = validateWizard({ ...form, monthlyPayment: '' }, todayIso);
    if (!result.ok || !result.draft) return null;
    return derivePayment(
      result.draft.balance,
      result.draft.ratePct,
      result.draft.remainingTermMonths,
      result.draft.repaymentType,
    );
  })();

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.flex} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.title}>{editing ? 'Edit mortgage' : 'Add a mortgage'}</Text>
          <Text style={styles.stepLabel}>
            Step {step + 1} of {STEPS.length} — {STEPS[step]}
          </Text>
        </View>

        {step === 0 && (
          <View>
            <Field
              label="Lender"
              value={form.lender}
              onChange={set('lender')}
              placeholder="e.g. Nationwide"
              error={errors.lender}
            />
            <Pills options={COMMON_LENDERS} selected={form.lender} onSelect={set('lender')} />
            <View style={styles.gap} />
            <Field
              label="Outstanding balance (£)"
              value={form.balance}
              onChange={set('balance')}
              placeholder="e.g. 185000"
              keyboardType="decimal-pad"
              error={errors.balance}
            />
            <Field
              label="Interest rate (% a year)"
              value={form.ratePct}
              onChange={set('ratePct')}
              placeholder="e.g. 4.92"
              keyboardType="decimal-pad"
              error={errors.ratePct}
            />
            <Text style={styles.sectionLabel}>Repayment type</Text>
            <Pills
              options={['repayment', 'interest-only']}
              selected={form.repaymentType}
              onSelect={(v) => setForm((f) => ({ ...f, repaymentType: v as WizardForm['repaymentType'] }))}
            />
            <View style={styles.gap} />
            <Field
              label="Monthly payment (£) — optional"
              value={form.monthlyPayment}
              onChange={set('monthlyPayment')}
              placeholder="Leave blank to work it out"
              keyboardType="decimal-pad"
              error={errors.monthlyPayment}
              hint={derivedPreview != null ? `We'll use ${formatPoundsPence(derivedPreview)} based on the balance, rate and term.` : undefined}
            />
          </View>
        )}

        {step === 1 && (
          <View>
            <Text style={styles.sectionLabel}>When does the current deal end?</Text>
            <View style={styles.dateRow}>
              <View style={styles.dateCell}>
                <Field label="Day" value={form.dealEndDay} onChange={set('dealEndDay')} placeholder="31" keyboardType="number-pad" />
              </View>
              <View style={styles.dateCell}>
                <Field label="Month" value={form.dealEndMonth} onChange={set('dealEndMonth')} placeholder="3" keyboardType="number-pad" />
              </View>
              <View style={[styles.dateCell, styles.dateCellWide]}>
                <Field
                  label="Year"
                  value={form.dealEndYear}
                  onChange={set('dealEndYear')}
                  placeholder="2027"
                  keyboardType="number-pad"
                  error={errors.dealEndYear}
                />
              </View>
            </View>
            <Text style={styles.sectionLabel}>Remaining mortgage term</Text>
            <View style={styles.dateRow}>
              <View style={[styles.dateCell, styles.dateCellWide]}>
                <Field
                  label="Years"
                  value={form.termYears}
                  onChange={set('termYears')}
                  placeholder="21"
                  keyboardType="number-pad"
                  error={errors.termYears}
                />
              </View>
              <View style={[styles.dateCell, styles.dateCellWide]}>
                <Field label="Months" value={form.termMonths} onChange={set('termMonths')} placeholder="0" keyboardType="number-pad" />
              </View>
            </View>
          </View>
        )}

        {step === 2 && (
          <View>
            <Field
              label="Property value (£) — optional"
              value={form.propertyValue}
              onChange={set('propertyValue')}
              placeholder="Enables the LTV badge"
              keyboardType="decimal-pad"
              error={errors.propertyValue}
            />
            <Field
              label="Early repayment charges (% per year) — optional"
              value={form.erc}
              onChange={set('erc')}
              placeholder="e.g. 5, 4, 3, 2, 1"
              error={errors.erc}
              hint="One percentage per deal year, first year first."
            />
            <Field
              label="Your lender's SVR (% a year) — optional"
              value={form.lenderSvr}
              onChange={set('lenderSvr')}
              placeholder="e.g. 7.99"
              keyboardType="decimal-pad"
              error={errors.lenderSvr}
              hint="The rate your deal reverts to. Left blank, we use the Bank of England average."
            />
          </View>
        )}

        {warning ? <Text style={styles.warning}>{warning} Tap again to save anyway.</Text> : null}

        <View style={styles.buttons}>
          <Pressable style={styles.secondary} onPress={step === 0 ? onCancel : () => setStep(step - 1)}>
            <Text style={styles.secondaryText}>{step === 0 ? 'Cancel' : 'Back'}</Text>
          </Pressable>
          <Pressable style={styles.primary} onPress={next} accessibilityRole="button">
            <Text style={styles.primaryText}>{step === STEPS.length - 1 ? 'Save' : 'Next'}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: 20, paddingBottom: 48 },
  header: { marginBottom: 18 },
  title: { color: colors.text, fontSize: 24, fontWeight: '700' },
  stepLabel: { color: colors.textDim, fontSize: 13, marginTop: 4 },
  sectionLabel: { color: colors.textDim, fontSize: 13, fontWeight: '600', marginBottom: 8, marginTop: 4 },
  gap: { height: 16 },
  dateRow: { flexDirection: 'row', gap: 10 },
  dateCell: { flex: 1 },
  dateCellWide: { flex: 1.4 },
  warning: { color: colors.warn, fontSize: 13, marginTop: 4, marginBottom: 8 },
  buttons: { flexDirection: 'row', gap: 12, marginTop: 18 },
  primary: {
    flex: 1,
    backgroundColor: colors.accent,
    borderRadius: radii.card,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryText: { color: '#0B1220', fontSize: 16, fontWeight: '700' },
  secondary: {
    flex: 1,
    borderColor: colors.cardBorder,
    borderWidth: 1,
    borderRadius: radii.card,
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryText: { color: colors.text, fontSize: 16, fontWeight: '600' },
});
