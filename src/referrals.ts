// Broker referral layer (RM-7) — same all-off pattern as FF-7's affiliate
// module: one config object shipped fully disabled, a pure offer resolver
// that returns nothing unless every field is valid, and a capped local click
// log. With the shipped config, zero referral UI renders anywhere.
//
// Partner economics researched 2026-07 (for whenever a programme accepts us):
// Tembo partner portal ~50% of proc fee (~£350–500/completion, best),
// Habito via Webgains £50 CPL / £250 CPA (verify post-Monzo acquisition),
// Mojo via RVU, L&C direct-only. None of that ships — flags stay off until
// a partner approves us and supplies creatives.
//
// FCA rules, hard-coded for v1:
// - No product recommendations anywhere. The app is generic maths; a referral
//   CTA is an introduction, never advice.
// - A referral CTA is a s21 financial promotion — the copy must be the
//   broker's approved creative. Until one exists, `cta` stays empty and the
//   resolver substitutes an unmistakable placeholder (test flags only).
// - RISK_WARNING accompanies every rendered promotion, verbatim.
// - Introducer hygiene: commission disclosure lives in About (COMMISSION_
//   DISCLOSURE), and we never pre-fill or pass borrower details.
//
// Pure module: no React Native imports, so tests can bundle it.

/** High-intent moments where a CTA may render, each independently flagged. */
export type ReferralPlacement =
  | 'push-landing' // dashboard, inside the final 6 months (T-6mo push lands here)
  | 'market-saving' // "switching saves £X/mo" card
  | 'breakeven-positive' // ERC break-even resolves to a finite month count
  | 'svr-drift'; // final-3-months revert-rate warning

export const REFERRAL_PLACEMENTS: readonly ReferralPlacement[] = [
  'push-landing',
  'market-saving',
  'breakeven-positive',
  'svr-drift',
];

export type PartnerKey = 'habito' | 'tembo' | 'mojo' | 'lc';

export const PARTNER_NAMES: Record<PartnerKey, string> = {
  habito: 'Habito',
  tembo: 'Tembo',
  mojo: 'Mojo Mortgages',
  lc: 'L&C Mortgages',
};

export interface ReferralConfig {
  /** Master switch — false at ship. */
  enabled: boolean;
  /** One live partner at a time; '' = none. */
  partner: PartnerKey | '';
  /** Partner-supplied tracked link, https only. */
  url: string;
  /** Broker-approved creative copy (s21). Empty until a partner approves us. */
  cta: string;
  /** Per-placement flags — all false at ship. */
  placements: Record<ReferralPlacement, boolean>;
}

// Live defaults: everything off until a broker programme accepts us.
export const REFERRAL_CONFIG: ReferralConfig = {
  enabled: false,
  partner: '',
  url: '',
  cta: '',
  placements: {
    'push-landing': false,
    'market-saving': false,
    'breakeven-positive': false,
    'svr-drift': false,
  },
};

/** Mandatory on every rendered promotion, verbatim (MCOB 3A). */
export const RISK_WARNING =
  'Your home may be repossessed if you do not keep up repayments on your mortgage.';

/** Shown in About — introducer commission disclosure. */
export const COMMISSION_DISCLOSURE =
  'If you follow a link to a mortgage broker from this app, we may receive a ' +
  'commission from them. This never affects what you pay. We are an introducer, ' +
  'not an adviser: nothing in this app is advice or a recommendation, and any ' +
  'advice comes from the broker, who is authorised and regulated by the ' +
  'Financial Conduct Authority.';

/** Stand-in copy so a test flag renders visibly-unapproved creative. */
export const CTA_PLACEHOLDER =
  '[PLACEHOLDER — replace with partner-approved promotion copy before launch]';

export interface ReferralOffer {
  placement: ReferralPlacement;
  partner: PartnerKey;
  partnerName: string;
  url: string;
  cta: string;
  /** Always RISK_WARNING — carried on the offer so the UI can't forget it. */
  riskWarning: string;
}

const isHttps = (url: string): boolean => {
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
};

/**
 * The offer for a placement, or null. Null (nothing renders) unless the
 * master switch is on, the partner key is known, the URL is a valid https
 * link and the placement's own flag is set — a partial or malformed config
 * renders nothing rather than a broken or non-compliant promotion.
 */
export function referralFor(
  placement: ReferralPlacement,
  config: ReferralConfig = REFERRAL_CONFIG,
): ReferralOffer | null {
  if (!config.enabled) return null;
  if (!config.partner || !(config.partner in PARTNER_NAMES)) return null;
  if (!isHttps(config.url)) return null;
  if (!config.placements?.[placement]) return null;
  return {
    placement,
    partner: config.partner,
    partnerName: PARTNER_NAMES[config.partner],
    url: config.url,
    cta: config.cta.trim() || CTA_PLACEHOLDER,
    riskWarning: RISK_WARNING,
  };
}

// --- Click log (entries newest-first, capped — same as EPC-6/FF-7) ---------

export interface ReferralClick {
  timestamp: number;
  placement: ReferralPlacement;
  partner: PartnerKey;
  url: string;
}

export const MAX_CLICKS = 200;

export function appendClick(
  log: ReferralClick[],
  entry: ReferralClick,
  max: number = MAX_CLICKS,
): ReferralClick[] {
  return [entry, ...log].slice(0, max);
}
