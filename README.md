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
- **Overpayment tools** — one screen per mortgage, all pure maths: (1)
  instant impact — enter a one-off and/or monthly overpayment and see "saves
  £X interest, cuts Y months" from a month-by-month amortisation diff; (2)
  allowance tracker — configurable annual limit (default 10% of the balance
  at the start of the allowance year, resetting on the deal anniversary or
  1 January), logged overpayments count against it, "£X of £Y used — £Z
  left, resets DD MMM", and a warning before logging anything that would
  breach it; (3) overpay vs save — guaranteed return at the mortgage rate
  against a user-entered savings rate after tax (basic/higher/ISA). Logged
  overpayments persist and reduce the dashboard balance projection
  (compounded at the mortgage rate from the date they were made).
- **Switching costs** — two comparators nobody else ships in-app: (1) ERC
  break-even — the ERC in force (from the setup schedule) plus editable
  remortgage fees against the monthly saving at a target rate (pre-filled
  from the BoE benchmark, ±0.1% steppers) → "breaks even in N months —
  worth it if you'll stay past MMM YYYY"; (2) product transfer vs full
  remortgage — side-by-side 5-year cost table (fees + ERC + interest
  accrued), with a toggle for the ERC-free transfer window lenders often
  offer in the final 3–6 months. Every assumption is a visible, editable
  input and the output is a factual cost table, never a recommendation.
- **Reminders & widget** — the retention layer, all local (no server): (1)
  scheduled notifications at 6 months ("you can lock a new deal today and
  still switch if rates fall"), 3 months, 1 month, 1 week and on deal-end
  day (with the £/mo cost of drifting onto the revert rate), plus the
  overpayment-allowance reset day — the whole schedule regenerates whenever
  the deal date is edited, and a "Test reminders" link on the dashboard
  fires a real one in 2 seconds for QA; (2) an evening nudge on each Bank
  of England MPC decision day (static calendar, personalised impact on
  next app open); (3) an iOS home-screen widget (`targets/widget/`, via
  `@bacons/apple-targets`) showing the day countdown and your rate vs the
  BoE benchmark, deep-linking into the app — data crosses via App Group
  UserDefaults, Swift compiles on the EAS build (RM-8). Live Activity was
  deliberately deferred: a months-long countdown doesn't fit an 8-hour
  activity budget.
- **Broker referrals (dormant)** — a config-driven referral layer
  (`src/referrals.ts`) shipped with every flag off, so no referral UI
  renders anywhere. When a broker programme approves us: one partner, four
  placement flags (final-6-months dashboard, saving card, positive ERC
  break-even, SVR-drift warning), https-only links, broker-approved copy
  only (an unmistakable placeholder renders under test flags), the FCA
  risk warning on every promotion, a commission disclosure in About, and a
  local click log capped at 200 entries. Partial or malformed config
  renders nothing.

## Engine

`src/amortisation.ts` is pure TypeScript (no React Native imports) covering
monthly interest, annuity payment derivation, iterative balance projection,
LTV, calendar countdown maths and ERC schedule lookup. It is unit-tested
against hand-verified worked examples, e.g. £100,000 at 6% over 300 months →
£644.30/month; £200,000 at 5% paying £1,169.18 → ~£195,876 after 12 months.

## Ship

- **iOS / TestFlight** — `.github/workflows/ios.yml` (dispatch-only): expo
  prebuild, strip the unused push entitlement (expo-notifications injects
  `aps-environment` but the app only schedules local notifications), manual
  signing patched per target (app + widget need different provisioning
  profiles), build number = run number, upload via App Store Connect API key.
- **Web demo** — `.github/workflows/web.yml` (dispatch-only) exports the web
  build to gh-pages: https://lukecode99.github.io/remortgage-countdown/

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
