# Third-party SDK & data-flow audit

_Last reviewed: 13 October 2026 · `npm audit --omit=dev`: **0 vulnerabilities**_

## In the browser

**None.** No third-party scripts, fonts, analytics, advertising, social widgets,
iframes or tracking pixels. This is enforced by the server's
Content-Security-Policy (`default-src 'self'; script-src 'self'; font-src 'self'; connect-src 'self'; frame-ancestors 'none'`)
and checked by the smoke tests, which fail if any page references an external
script or Google Fonts.

| Previously | Now | Why |
| --- | --- | --- |
| Google Fonts (Sora, Inter) loaded from `fonts.googleapis.com` | Self-hosted WOFF2 files in `public/fonts/` | Loading Google Fonts sends every visitor's IP address to Google (held unlawful under the GDPR in LG München I, 3 O 17493/20). Self-hosting removes the transfer and needs no consent. |

## On the server (runtime dependencies)

| Package | Version | Licence | Purpose | Personal data it touches | Where data goes |
| --- | --- | --- | --- | --- | --- |
| express | 4.22.x | MIT | HTTP server | Request bodies (in memory only) | Nowhere |
| nodemailer | 10.0.12 (pinned) | MIT-0 | Sends email via the SMTP provider you configure | Names, emails, messages in notifications; applicant email for opt-in reference emails | Your SMTP provider |
| stripe | 16.x | MIT | Creates Stripe Checkout sessions | Optional email address | Stripe (US/IE) — card data is entered on stripe.com, never on our servers |

Transitive dependencies: 134 packages, all from the npm registry, locked in `package-lock.json`.

## External services (only when configured)

| Service | Enabled by | Data sent | Notes |
| --- | --- | --- | --- |
| Home Affairs (Visa) Entitlements API | `VEVO_CLIENT_ID` + token/cert | Visa holder name, passport no., country, DOB — per check | Holder consent required; operator-key gated; nothing stored or logged |
| Stripe Checkout | `STRIPE_SECRET_KEY` | Service ID, optional email | Stripe sets its own cookies on stripe.com only |
| SMTP provider | `SMTP_URL` / `SMTP_HOST…` | Notification and reference emails | Choose an AU-region provider if you need onshore data |
| Hosting (e.g. Render) | deployment | All stored data (`DATA_DIR`) | Disclosed as overseas disclosure in the Privacy Policy |

## Licences of bundled assets

| Asset | Licence | File |
| --- | --- | --- |
| Inter typeface | SIL Open Font License 1.1 | `public/fonts/LICENSE-Inter-OFL.txt` |
| Sora typeface | SIL Open Font License 1.1 | `public/fonts/LICENSE-Sora-OFL.txt` |
| Logo (`public/assets/logo.svg`) | Original work for AusWise | — |
| Home Affairs OpenAPI specs (`server/data/visa-entitlements-*.openapi.json`) | Published by the Department of Home Affairs for API consumers | — |

No stock photos, icon packs or other third-party images are used.

## Re-running this audit

```bash
npm audit --omit=dev
npm ls --omit=dev --all
grep -rhoE "https?://[a-zA-Z0-9.-]+" public/js public/css | sort -u   # should list only official gov links
npm test                                                             # includes CSP + no-third-party checks
```
