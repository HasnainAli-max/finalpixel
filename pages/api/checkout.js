// pages/api/checkout.js
import { stripe } from '@/lib/stripe/stripe';
import { authAdmin } from '@/lib/firebase/firebaseAdmin';

const PRICE_MAP = {
  basic: process.env.STRIPE_PRICE_BASIC,
  pro:   process.env.STRIPE_PRICE_PRO,
  elite: process.env.STRIPE_PRICE_ELITE,
};

// Use deployed site in prod, localhost in dev
const BASE_URL =  'https://finalpixel.vercel.app';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Missing ID token' });

    const decoded = await authAdmin.verifyIdToken(token);
    const { plan, priceId } = req.body || {};
    const resolvedPrice = priceId || (plan ? PRICE_MAP[plan] : null);

    if (!resolvedPrice || !/^price_/.test(resolvedPrice)) {
      return res.status(400).json({ error: 'Invalid or missing price.' });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer_email: decoded.email || undefined,
      line_items: [{ price: resolvedPrice, quantity: 1 }],
      // Redirects updated to /billing pages
      success_url: `${BASE_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${BASE_URL}/billing/cancel`,
      metadata: { uid: decoded.uid, plan: plan || 'custom' },
    });

    return res.status(200).json({ url: session.url });
  } catch (e) {
    console.error('checkout error', e);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
