// RN → widget bridge. Writes the payload built by src/widgetData.ts into the
// App Group UserDefaults via @bacons/apple-targets' ExtensionStorage, then
// asks WidgetKit to reload timelines. ExtensionStorage no-ops when the native
// module is absent (Expo Go, web, Android), so this is always safe to call.
import { ExtensionStorage } from '@bacons/apple-targets';
import { MarketSnapshot } from './market';
import type { Mortgage } from './types';
import { widgetPayload } from './widgetData';

/** Must match the app-group in app.json and targets/widget/expo-target.config.js. */
export const APP_GROUP = 'group.com.lukeholder.remortgagecountdown';
/** UserDefaults key the Swift widget reads — see targets/widget/index.swift. */
export const WIDGET_KEY = 'widget_data';

const storage = new ExtensionStorage(APP_GROUP);

export function syncWidget(mortgages: Mortgage[], todayIso: string, snapshot: MarketSnapshot | null): void {
  const payload = widgetPayload(mortgages, todayIso, snapshot);
  if (payload) storage.set(WIDGET_KEY, JSON.stringify(payload));
  else storage.remove(WIDGET_KEY);
  ExtensionStorage.reloadWidget();
}
