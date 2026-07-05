// Client for the uk-mortgage-rates worker (RM-1). Snapshot is cached in
// AsyncStorage so the comparison still renders offline; staleness relative to
// the *data* month is handled in market.ts, this cache TTL just limits
// needless refetches (the source updates at most twice a month).
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { MarketSnapshot } from './market';

export const RATES_URL = 'https://uk-mortgage-rates.nanoluke521.workers.dev/rates';
const CACHE_KEY = 'market:v1';
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

interface Cached {
  savedAt: number;
  snapshot: MarketSnapshot;
}

async function readCache(): Promise<Cached | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Cached;
    if (!parsed?.snapshot?.rates?.length) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function fetchMarket(now = Date.now()): Promise<MarketSnapshot | null> {
  const cached = await readCache();
  if (cached && now - cached.savedAt < CACHE_TTL_MS) return cached.snapshot;

  try {
    const res = await fetch(RATES_URL);
    if (!res.ok) throw new Error(`rates ${res.status}`);
    const snapshot = (await res.json()) as MarketSnapshot;
    if (!snapshot?.rates?.length) throw new Error('empty snapshot');
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: now, snapshot } satisfies Cached));
    return snapshot;
  } catch {
    return cached?.snapshot ?? null; // offline → stale cache beats nothing
  }
}
