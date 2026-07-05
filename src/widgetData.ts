// Widget payload builder — pure TS, no React Native imports, unit-tested.
// The RN bridge (src/widget.ts) writes this to the App Group UserDefaults via
// @bacons/apple-targets ExtensionStorage; the Swift widget reads it back
// (targets/widget/index.swift). Keep the shape in sync with WidgetData there.
import { compareToMarket, MarketSnapshot } from './market';
import type { Mortgage } from './types';

export interface WidgetPayload {
  lender: string;
  /** Deal end, ISO yyyy-mm-dd — the widget computes the live day count itself. */
  dealEndDate: string;
  yourRatePct: number;
  /** Matched BoE benchmark for a 2-year fix at the mortgage's LTV band. */
  benchmarkPct: number | null;
  /** Provenance month for the benchmark, e.g. "May 2026". */
  benchmarkAsOf: string | null;
}

/**
 * One payload for the widget: the mortgage whose deal ends soonest (the same
 * one the dashboard sorts to the top), with the 2-year-fix benchmark the app
 * uses as its headline comparison. Null when there are no mortgages — the
 * bridge then clears the stored value and the widget shows its empty state.
 */
export function widgetPayload(
  mortgages: Mortgage[],
  todayIso: string,
  snapshot: MarketSnapshot | null,
): WidgetPayload | null {
  if (mortgages.length === 0) return null;
  const m = [...mortgages].sort((a, b) => a.dealEndDate.localeCompare(b.dealEndDate))[0];
  const cmp = snapshot ? compareToMarket(m, snapshot, todayIso, 2) : null;
  return {
    lender: m.lender,
    dealEndDate: m.dealEndDate,
    yourRatePct: m.ratePct,
    benchmarkPct: cmp?.benchmarkPct ?? null,
    benchmarkAsOf: cmp?.asOfMonth ?? null,
  };
}
