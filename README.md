# Remortgage Countdown

An iOS app (Expo) that counts down to the end of your mortgage deal and keeps a
live picture of where the loan stands: projected balance today, loan-to-value,
monthly payment and the early-repayment charge currently in force.

No accounts, no sign-up, no ads. Everything stays on the device
(AsyncStorage). Up to 5 mortgages.

## What it does

- **Setup wizard** — three short steps: the loan (lender, balance, rate,
  repayment type, optional payment), the dates (deal end, remaining term) and
  extras (property value for LTV, ERC schedule). Leave the payment blank and
  the app derives it with the standard annuity formula.
- **Dashboard** — one card per mortgage, sorted by deal end date: a big
  day-countdown (amber inside 90 days), months-and-days breakdown, balance
  projected to today, LTV badge, rate, remaining term and the ERC percentage
  currently in force.
- **Edit / delete** — from each card; state survives restarts.
- **Market comparison** — your rate against the matching Bank of England
  average quoted rate (from the companion
  [uk-mortgage-rates](https://github.com/lukecode99/uk-mortgage-rates)
  worker): the LTV maps to the smallest published band that covers it
  (72% → the 75% band; 3/5/10-year fixes are only published at 75%), the
  saving is the payment recomputed at the benchmark on today's balance, and
  the maths expands on tap. Inside the final 3 months the card also shows the
  cost of lapsing onto the revert rate (BoE average, or your lender's SVR if
  entered). Everything is labelled as a BoE average with its month — averages
  of advertised rates, never a quote or a recommendation — and data more than
  2 months old is flagged stale.

## Engine

`src/amortisation.ts` is pure TypeScript (no React Native imports) covering
monthly interest, annuity payment derivation, iterative balance projection,
LTV, calendar countdown maths and ERC schedule lookup. It is unit-tested
against hand-verified worked examples, e.g. £100,000 at 6% over 300 months →
£644.30/month; £200,000 at 5% paying £1,169.18 → ~£195,876 after 12 months.

## Development

```bash
npm install
npm test            # engine + wizard-validation unit tests
npm run typecheck   # tsc --noEmit
npm run build:web   # expo export --platform web
npm start           # Expo dev server
```

## Notes

- Projections assume monthly compounding at the quoted annual rate — the
  standard UK basis. They're estimates, not statements.
- The working title is "Remortgage Countdown"; final name TBC.
