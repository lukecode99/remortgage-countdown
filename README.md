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
