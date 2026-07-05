import AsyncStorage from '@react-native-async-storage/async-storage';
import { MAX_MORTGAGES, Mortgage } from './types';

const KEY = 'mortgages:v1';

export async function loadMortgages(): Promise<Mortgage[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function persist(list: Mortgage[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(list));
}

/** Insert or replace by id. Throws on adding beyond MAX_MORTGAGES. */
export async function saveMortgage(m: Mortgage): Promise<Mortgage[]> {
  const list = await loadMortgages();
  const i = list.findIndex((x) => x.id === m.id);
  if (i >= 0) list[i] = m;
  else {
    if (list.length >= MAX_MORTGAGES) throw new Error(`Maximum of ${MAX_MORTGAGES} mortgages`);
    list.push(m);
  }
  await persist(list);
  return list;
}

export async function deleteMortgage(id: string): Promise<Mortgage[]> {
  const list = (await loadMortgages()).filter((m) => m.id !== id);
  await persist(list);
  return list;
}

export const newId = (): string =>
  `m_${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
