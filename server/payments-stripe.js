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
    name: 'Expert SOP review',
    description:
      'A professional reviews and polishes the SOP you built here (free) — structure, evidence, tone and the questions decision-makers actually ask.',
    amount: 7900,
    popular: true,
  },
  {
    id: 'consult-1on1',
    name: 'One-on-one detailed session',
    description:
      'A private video/phone session to go deep on your situation: pathway strategy, points, timing, risks and a step-by-step plan.',
    amount: 9900,
    popular: true,
  },
];

/** What the platform includes at no charge — shown alongside the paid extras. */
export const FREE_FEATURES = [
  'Every visa guide, requirement list and document checklist',
  'The 30-second visa finder',
  'The full application questionnaire for every visa type',
  'The SOP builder with live preview (build unlimited drafts)',
  'VEVO visa-conditions checks',
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
      popular: Boolean(s.popular),
    })),
    note: isStripeConfigured()
      ? 'The platform is free. These two optional extras are the only things we charge for — secure checkout by Stripe. Government visa charges are always paid separately, directly to Home Affairs.'
      : 'The platform is free. The two optional extras aren’t payable online in this deployment yet — send a free enquiry and we’ll arrange it. (Set STRIPE_SECRET_KEY to enable Stripe Checkout.)',
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
    return new Intl.NumberFormat('en-AU', { style: 'currency', currency: currency.toUpperCase() }).format(
      amountCents / 100
    );
  } catch {
    return `$${(amountCents / 100).toFixed(2)}`;
  }
}
