# Legal & compliance checklist

How each requirement is met in the code, and what the business still has to do.
**This is engineering work, not legal advice — have an Australian lawyer review
the policies before launch.**

| # | Requirement | Status | Where / how |
| --- | --- | --- | --- |
| 1 | Privacy policy | ✅ | `/privacy.html` — APP 1 contents: kinds of info, purposes, sensitive info, children, disclosure, overseas disclosure (APP 8), security, retention, NDB scheme, access/correction, OAIC complaints, GDPR rights |
| 2 | Terms of service | ✅ | `/terms.html` — not immigration assistance (Migration Act s276), not government-affiliated, directory disclaimer, review rules, agent terms, ACL rights preserved |
| 3 | Refund policy | ✅ | `/refunds.html` — ACL major/minor failure remedies, cancellation windows, government charges not refundable by us |
| 4 | Cookie policy | ✅ | `/cookies.html` — no cookies set; every localStorage key listed with purpose and lifetime |
| 5 | Cookie consent banner | ✅ | `public/js/site.js` + `consent.js` — equal-weight “Allow saving drafts” / “Essential only”; optional storage off until chosen; “Storage settings” in every footer |
| 6 | Form consents | ✅ | Unticked checkboxes on every form; enforced server-side (`requireConsents`); consent record + policy version stored with each submission |
| 7 | No unnecessary data | ✅ | Passport number removed from questionnaire; unknown fields dropped server-side; SOP stores no name/text; contact form stores no phone; VEVO data never stored or logged; IPs only in memory; auto-purge after `RETENTION_DAYS` |
| 8 | Audit third-party SDKs | ✅ | `docs/THIRD_PARTY_AUDIT.md`; Google Fonts removed; strict CSP; `npm audit` 0 vulns (fixed critical `proxy-addr`, high `nodemailer`) |
| 9 | Remove dark patterns | ✅ | No pre-ticked boxes, no “Most popular” nudges, equal consent buttons, delete-account and unsubscribe as easy as sign-up |
| 10 | Remove hidden fees | ✅ | Total prices incl. GST, “no booking fees, card surcharges or subscriptions” shown next to prices and in Refund Policy |
| 11 | Remove fake reviews | ✅ | Fictional agents and sample reviews deleted (and purged from existing databases at startup); genuine-client declaration; no self-reviews; 5 reviews/IP/day |
| 12 | Remove unsupported claims | ✅ | Removed “100% official sources”, “30 seconds”, “forever”, “real reviews”, “stress-free”, “same questionnaire a consultancy uses”, competitor disparagement, and wording implying Home Affairs affiliation or personalised advice |
| 13 | Accessibility alt text | ✅ | Logo next to its text label uses `alt=""`; decorative graphics `aria-hidden`; dialogs labelled |
| 14 | Colour contrast | ✅ | All text ≥ 4.5:1 (fixed mint text 3.1→6.1, toasts 3.1/3.9→6.1/5.6, stars, tags) |
| 15 | Keyboard navigation | ✅ | Skip link, visible focus, focus trapped in and restored from dialogs, star rating as radio group, `aria-pressed`/`aria-expanded`/`aria-current`, wizard moves focus to each section |
| 16 | Business details | ⚠️ needs you | Set `BUSINESS_LEGAL_NAME`, `BUSINESS_ABN` (checksum-validated), `BUSINESS_ADDRESS`, `BUSINESS_EMAIL`, `BUSINESS_JURISDICTION`. Until then pages show a visible “not yet provided” marker and `/api/stats` reports `businessDetails: incomplete` |
| 17 | Age consent for children’s data | ✅ | Questionnaire derives age from DOB server-side; under-18 requires guardian name, email and consent; forms require 18+ or guardian confirmation; agents must be 18+ |
| 18 | Unsubscribe link in emails | ✅ | Only opt-in applicant emails; each has sender ID, HMAC-signed unsubscribe link, RFC 8058 one-click headers; suppression list honoured immediately |
| 19 | Licence fonts/images | ✅ | Inter + Sora under OFL 1.1 with licence files shipped; logo original; no stock images |
| 20 | Data deletion request | ✅ | `/data-requests.html`: instant self-service delete (reference + email), access/correction/complaint requests (30-day APP 12 timeline), agent self-delete, clear device data |

## Also done
- **VEVO**: live checks restricted to authorised staff (`VEVO_OPERATOR_KEY`) and require visa-holder consent, so the organisation's Home Affairs enrolment cannot be used by the public.
- **Payout bank details** encrypted at rest (AES-256-GCM); refused entirely without `DATA_ENCRYPTION_KEY`.
- **Security headers**: CSP, `X-Frame-Options: DENY`, `nosniff`, strict referrer, permissions policy; form rate limits.
- **Accessibility statement** at `/accessibility.html`.

## Before launch — business actions
1. Set the `BUSINESS_*` variables (item 16).
2. Set `DATA_ENCRYPTION_KEY` and `UNSUBSCRIBE_SECRET` (long random strings; keep them stable).
3. Confirm the operational promises in the policies are true for you: reply within 5 business days, refunds within 5–10 business days, one free reschedule, 30-day privacy responses, agent payouts.
4. Make sure the two paid extras really are delivered by registered migration agents (Migration Act s280 — unregistered immigration assistance is an offence).
5. Have an Australian lawyer review the Privacy Policy, Terms and Refund Policy.
