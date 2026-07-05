import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import DashboardScreen from './src/screens/DashboardScreen';
import OverpayScreen from './src/screens/OverpayScreen';
import SwitchScreen from './src/screens/SwitchScreen';
import WizardScreen from './src/screens/WizardScreen';
import { fetchMarket } from './src/api';
import { todayIso } from './src/format';
import { MarketSnapshot } from './src/market';
import { syncNotifications, triggerTestNotification } from './src/notify';
import { deleteMortgage, loadMortgages, newId, saveMortgage } from './src/storage';
import { syncWidget } from './src/widget';
import { colors } from './src/theme';
import { Mortgage } from './src/types';
import { MortgageDraft } from './src/wizard';

type View =
  | { name: 'dashboard' }
  | { name: 'wizard'; editing: Mortgage | null }
  | { name: 'overpay'; mortgageId: string }
  | { name: 'switch'; mortgageId: string };

export default function App() {
  const [mortgages, setMortgages] = useState<Mortgage[]>([]);
  const [market, setMarket] = useState<MarketSnapshot | null>(null);
  const [view, setView] = useState<View>({ name: 'dashboard' });
  const [loaded, setLoaded] = useState(false);
  const today = todayIso();

  useEffect(() => {
    loadMortgages().then((list) => {
      setMortgages(list);
      setLoaded(true);
      if (list.length === 0) setView({ name: 'wizard', editing: null });
    });
    fetchMarket().then(setMarket); // comparison block renders when this lands
  }, []);

  // Keep the OS notification schedule and the home-screen widget in step with
  // the data: any change (deal date edit, new/deleted mortgage, market
  // refresh) regenerates the plan and rewrites the widget payload.
  useEffect(() => {
    if (!loaded) return;
    syncNotifications(mortgages, today, market).catch(() => {});
    try {
      syncWidget(mortgages, today, market);
    } catch {
      // native module absent (Expo Go / web) — widget sync is a no-op
    }
  }, [loaded, mortgages, market]);

  const handleSave = async (draft: MortgageDraft) => {
    const editing = view.name === 'wizard' ? view.editing : null;
    const now = new Date().toISOString();
    const m: Mortgage = editing
      ? { ...editing, ...draft, balanceAsOf: today, updatedAt: now }
      : { ...draft, id: newId(), balanceAsOf: today, createdAt: now, updatedAt: now };
    setMortgages(await saveMortgage(m));
    setView({ name: 'dashboard' });
  };

  const handleDelete = async (m: Mortgage) => {
    setMortgages(await deleteMortgage(m.id));
  };

  // Overpay screen edits (logged overpayments, allowance config) — persist
  // without re-baselining balanceAsOf, unlike the wizard.
  const handleUpdate = async (m: Mortgage) => {
    setMortgages(await saveMortgage({ ...m, updatedAt: new Date().toISOString() }));
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
        <StatusBar style="light" />
        {loaded && view.name === 'dashboard' && (
          <DashboardScreen
            mortgages={mortgages}
            todayIso={today}
            market={market}
            onAdd={() => setView({ name: 'wizard', editing: null })}
            onEdit={(m) => setView({ name: 'wizard', editing: m })}
            onOverpay={(m) => setView({ name: 'overpay', mortgageId: m.id })}
            onSwitch={(m) => setView({ name: 'switch', mortgageId: m.id })}
            onDelete={handleDelete}
            onTestNotifications={() => triggerTestNotification(mortgages, today, market)}
          />
        )}
        {loaded && view.name === 'overpay' && (() => {
          const m = mortgages.find((x) => x.id === view.mortgageId);
          if (!m) {
            setView({ name: 'dashboard' });
            return null;
          }
          return (
            <OverpayScreen
              m={m}
              todayIso={today}
              onUpdate={handleUpdate}
              onBack={() => setView({ name: 'dashboard' })}
            />
          );
        })()}
        {loaded && view.name === 'switch' && (() => {
          const m = mortgages.find((x) => x.id === view.mortgageId);
          if (!m) {
            setView({ name: 'dashboard' });
            return null;
          }
          return (
            <SwitchScreen m={m} market={market} todayIso={today} onBack={() => setView({ name: 'dashboard' })} />
          );
        })()}
        {loaded && view.name === 'wizard' && (
          <WizardScreen
            editing={view.editing}
            todayIso={today}
            onSave={handleSave}
            onCancel={() => setView({ name: 'dashboard' })}
          />
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
