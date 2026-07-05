// Thin React Native layer over the pure scheduler (src/notifications.ts).
// Strategy: the plan is the source of truth — every sync cancels everything
// scheduled and re-schedules the current plan, so edits (deal date, allowance
// settings, added/deleted mortgages) are reflected with no diffing logic.
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { formatDate } from './format';
import { MarketSnapshot } from './market';
import { PlannedNotification, plannedNotifications } from './notifications';
import type { Mortgage } from './types';

// Show notifications even while the app is foregrounded.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

function fireDate(n: PlannedNotification): Date {
  const [y, m, d] = n.date.split('-').map(Number);
  return new Date(y, m - 1, d, n.hour, 0, 0); // local time
}

/**
 * Sync the OS notification schedule to the current plan. Returns the number
 * of notifications scheduled, or null when permission is missing/denied.
 */
export async function syncNotifications(
  mortgages: Mortgage[],
  todayIso: string,
  snapshot: MarketSnapshot | null,
): Promise<number | null> {
  if (Platform.OS === 'web') return null;
  const perms = await Notifications.getPermissionsAsync();
  let granted = perms.granted;
  if (!granted && perms.canAskAgain) {
    granted = (await Notifications.requestPermissionsAsync()).granted;
  }
  if (!granted) return null;

  await Notifications.cancelAllScheduledNotificationsAsync();
  const plan = plannedNotifications(mortgages, todayIso, snapshot);
  for (const n of plan) {
    await Notifications.scheduleNotificationAsync({
      identifier: n.id,
      content: { title: n.title, body: n.body },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fireDate(n) },
    });
  }
  return plan.length;
}

/**
 * Manual QA path: fires a real notification in 2 seconds carrying the next
 * planned entry, so testers can verify delivery and content without waiting
 * for a milestone. Returns a human-readable summary for the UI.
 */
export async function triggerTestNotification(
  mortgages: Mortgage[],
  todayIso: string,
  snapshot: MarketSnapshot | null,
): Promise<string> {
  if (Platform.OS === 'web') return 'Notifications are not available on web.';
  const granted = (await Notifications.requestPermissionsAsync()).granted;
  if (!granted) return 'Notification permission denied — enable it in Settings.';

  const plan = plannedNotifications(mortgages, todayIso, snapshot);
  const next = plan[0];
  await Notifications.scheduleNotificationAsync({
    identifier: 'qa-test',
    content: next
      ? { title: `[Test] ${next.title}`, body: `Would fire ${formatDate(next.date)}. ${next.body}` }
      : { title: '[Test] Notifications working', body: 'Nothing is planned — add a mortgage with a future deal end date.' },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 2 },
  });
  return next
    ? `Test sent — ${plan.length} scheduled, next: ${formatDate(next.date)}.`
    : 'Test sent — nothing scheduled yet.';
}
