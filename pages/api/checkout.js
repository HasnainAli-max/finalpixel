// pages/api/checkout.js
import { stripe } from '@/lib/stripe/stripe';
import { authAdmin } from '@/lib/firebase/firebaseAdmin';

const PRICE_MAP = {
  basic: process.env.STRIPE_PRICE_BASIC,
  pro:   process.env.STRIPE_PRICE_PRO,
  elite: process.env.STRIPE_PRICE_ELITE,
};

// Resolve BASE_URL for redirects (dev vs prod)
function resolveBaseUrl(req) {
  const devDefault  = process.env.NEXT_PUBLIC_DEV_URL || 'http://localhost:3000';
  const prodDefault = process.env.NEXT_PUBLIC_APP_URL || 'https://finalpixel.vercel.app';

  const origin = req.headers?.origin || '';
  if (/^http:\/\/localhost(?::\d+)?/i.test(origin)) return origin;

  const isProd = process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';
  return isProd ? prodDefault : devDefault;
}

// Find or create a Stripe customer for this user (by uid metadata first, then email)
async function getOrCreateCustomer({ uid, email, name }) {
  // 1) Prefer search by metadata.uid
  if (uid) {
    try {
      const byUid = await stripe.customers.search({
        query: `metadata['uid']:'${uid.replace(/'/g, "\\'")}'`,
        limit: 1,
      });
      if (byUid?.data?.[0]) return byUid.data[0];
    } catch {}
  }

  // 2) Fallback: search/list by email
  if (email) {
    try {
      const byEmail = await stripe.customers.search({
        query: `email:'${email.replace(/'/g, "\\'")}'`,
        limit: 1,
      });
      if (byEmail?.data?.[0]) return byEmail.data[0];
    } catch {
      const list = await stripe.customers.list({ email, limit: 1 });
      if (list?.data?.[0]) return list.data[0];
    }
  }

  // 3) Create new
  return await stripe.customers.create({
    email: email || undefined,
    name: name || undefined,
    metadata: { uid: uid || '' },
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // ----- Auth -----
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Missing ID token' });

    const decoded = await authAdmin.verifyIdToken(token); // { uid, email, name, ... }

    // ----- Inputs -----
    const { plan, priceId } = req.body || {};
    const resolvedPrice = priceId || (plan ? PRICE_MAP[plan] : null);
    if (!resolvedPrice || !/^price_/.test(resolvedPrice)) {
      return res.status(400).json({ error: 'Invalid or missing price.' });
    }

    const BASE_URL = resolveBaseUrl(req);

    // ----- Ensure a Stripe Customer -----
    const customer = await getOrCreateCustomer({
      uid: decoded.uid,
      email: decoded.email || null,
      name: decoded.name || null,
    });

    // ----- Create Checkout Session (subscription mode) -----
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customer.id, // ✅ pass customer instead of customer_creation
      line_items: [{ price: resolvedPrice, quantity: 1 }],

      // Helpful context
      client_reference_id: decoded.uid,
      metadata: { uid: decoded.uid, plan: plan || 'custom' },
      subscription_data: {
        metadata: { uid: decoded.uid, plan: plan || 'custom' },
      },

      // Redirects
      success_url: `${BASE_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${BASE_URL}/billing/cancel`,

      // Nice-to-haves
      allow_promotion_codes: true,
      billing_address_collection: 'auto',
      customer_update: { name: 'auto', address: 'auto' },
    });

    return res.status(200).json({ url: session.url });
  } catch (e) {
    console.error('checkout error', e);
    return res.status(500).json({ error: 'Internal Server Error', detail: e?.message });
  }
}
