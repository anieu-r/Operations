/**
 * Stripe payments for AusWise *service* fees (consultations, assessments,
 * application reviews).
 *
 * IMPORTANT: this is ONLY for AusWise's own professional-service fees. Australian
 * government Visa Application Charges are NEVER taken here — those are always
 * paid directly to the Department of Home Affairs via ImmiAccount (see the Fees
 * section). This keeps a clean, lawful separation.
 *
 * Configure with:
 *   STRIPE_SECRET_KEY   sk_test_... or sk_live_...   (required for live payments)
 *   STRIPE_CURRENCY     default 'aud'
 *   PUBLIC_BASE_URL     optional; used to build success/cancel return URLs
 *
 * Without STRIPE_SECRET_KEY the API runs in demo mode: it returns a clearly
 * labelled "not enabled" response and the UI invites an enquiry instead. Add the
 * key on deploy to switch on real Stripe Checkout — no code change needed.
 *
 * Inline price_data is used, so no pre-created Stripe Price IDs are required.
 */

const CURRENCY = (process.env.STRIPE_CURRENCY || 'aud').toLowerCase();

/**
 * Catalogue of paid services. Amounts are in the smallest currency unit (cents).
 *
 * PRICING POLICY: the platform is free. Everything — visa guides, the finder,
 * the questionnaire, the SOP builder, VEVO checks, news, the agent directory —
 * costs nothing. Money changes hands ONLY for these two optional extras.
 */
export const SERVICES = [
  {
    id: 'sop-review',
    name: 'SOP review by a registered migration agent',
    description:
      'A registered migration agent (MARN) reviews the SOP you built here (free) and gives written feedback on structure, evidence and tone.',
    amount: 7900,
  },
  {
    id: 'consult-1on1',
    name: 'One-on-one session with a registered migration agent',
    description:
      'A private video or phone session with a registered migration agent (MARN) from our directory to discuss your pathway, timing and risks. The agent receives the full A$99.',
    amount: 9900,
  },
];

/** What the platform includes at no charge — shown alongside the paid extras. */
export const FREE_FEATURES = [
  'Every visa guide, requirement list and document checklist',
  'The visa finder quiz',
  'The full application questionnaire for every visa type',
  'The SOP builder with live preview (build unlimited drafts)',
  'The VEVO demo (live checks are for enrolled organisations)',
  'Immigration news and official links',
  'The MARN agent directory, ratings and reviews',
  'The education institutions directory',
  'Enquiries and email support',
];

export function isStripeConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function publicConfig() {
  return {
    enabled: isStripeConfigured(),
    currency: CURRENCY.toUpperCase(),
    freePlatform: true,
    freeFeatures: FREE_FEATURES,
    services: SERVICES.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      amount: s.amount,
      display: formatMoney(s.amount, CURRENCY),
    })),
    priceNote: 'Prices are in Australian dollars and are the total you pay — GST included where applicable. No booking fees, card surcharges or subscriptions. See the Refund Policy for cancellations.',
    note: isStripeConfigured()
      ? 'These two optional extras are the only things we charge for. Payment is handled securely by Stripe. Government visa charges are separate and paid directly to Home Affairs.'
      : 'Online payment isn’t switched on yet — send a free enquiry if you want one of these extras. Government visa charges are separate and paid directly to Home Affairs.',
  };
}

export function findService(id) {
  return SERVICES.find((s) => s.id === id) || null;
}

/**
 * Create a Stripe Checkout Session for a service. Returns { url } on success.
 * Throws on configuration/Stripe errors (caller maps to a clean HTTP response).
 */
export async function createCheckoutSession({ serviceId, email, baseUrl }) {
  const service = findService(serviceId);
  if (!service) {
    const err = new Error('Unknown service');
    err.code = 'UNKNOWN_SERVICE';
    throw err;
  }
  if (!isStripeConfigured()) {
    const err = new Error('Payments are not enabled on this deployment.');
    err.code = 'NOT_CONFIGURED';
    throw err;
  }
  const { default: Stripe } = await import('stripe');
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  const origin = (process.env.PUBLIC_BASE_URL || baseUrl || '').replace(/\/$/, '');
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: CURRENCY,
          unit_amount: service.amount,
          product_data: { name: service.name, description: service.description },
        },
      },
    ],
    customer_email: email || undefined,
    metadata: { serviceId: service.id, kind: 'auswise-service-fee' },
    success_url: `${origin}/?pay=success&svc=${encodeURIComponent(service.id)}#services`,
    cancel_url: `${origin}/?pay=cancel#services`,
  });
  return { url: session.url, id: session.id };
}

function formatMoney(amountCents, currency) {
  try {
    // Show the currency explicitly ("A$79") so overseas visitors aren't misled about the price.
    const code = currency.toUpperCase();
    const n = new Intl.NumberFormat('en-AU', { minimumFractionDigits: amountCents % 100 ? 2 : 0 }).format(amountCents / 100);
    return code === 'AUD' ? `A$${n}` : `${code} ${n}`;
  } catch {
    return `$${(amountCents / 100).toFixed(2)}`;
  }
}
