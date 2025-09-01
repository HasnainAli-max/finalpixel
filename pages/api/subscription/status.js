// pages/api/subscription-status.js
import { stripe } from '@/lib/stripe/stripe';
import { authAdmin, db, adminSdk } from '@/lib/firebase/firebaseAdmin';
import { PLAN_BY_PRICE } from '@/utils/stripePlan';

export default async function handler(req, res) {
  // Allow both GET & POST so existing callers break na hon
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // ----- Auth -----
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Missing ID token' });

    const { uid, email } = await authAdmin.verifyIdToken(token);

    // ----- User doc -----
    const uref = db.collection('users').doc(uid);
    const usnap = await uref.get();

    // Prefer saved customerId; otherwise best-effort by email (and cache it)
    let customerId = usnap.get('stripeCustomerId') || null;

    if (!customerId && email) {
      try {
        const found = await stripe.customers.search({
          query: `email:'${String(email).replace(/'/g, "\\'")}'`,
          limit: 1,
        });
        if (found?.data?.length) {
          customerId = found.data[0].id;
        }
      } catch {
        const list = await stripe.customers.list({ email, limit: 1 });
        if (list?.data?.length) {
          customerId = list.data[0].id;
        }
      }
      if (customerId) {
        await uref.set({ stripeCustomerId: customerId }, { merge: true });
      }
    }

    if (!customerId) {
      return res.status(200).json({ status: 'no_customer' });
    }

    // ----- Subscriptions (pick latest) -----
    const subs = await stripe.subscriptions.list({
      customer: customerId,
      status: 'all',
      limit: 10,
      // light expand to read price safely
      expand: ['data.items.data.price'],
    });

    const latest =
      (subs?.data || []).sort((a, b) => (b.created || 0) - (a.created || 0))[0] || null;

    if (!latest) {
      return res.status(200).json({ status: 'no_subscription' });
    }

    const item = latest.items?.data?.[0] || null;
    const priceId = item?.price?.id || null;
    const planName = priceId ? (PLAN_BY_PRICE?.[priceId] || 'unknown') : 'unknown';

    // Save a concise snapshot on the user doc
    await uref.set(
      {
        stripeCustomerId: customerId,
        priceId,
        activePlan: planName,
        subscriptionStatus: latest.status,
        currentPeriodStart: latest.current_period_start
          ? adminSdk.firestore.Timestamp.fromMillis(latest.current_period_start * 1000)
          : null,
        currentPeriodEnd: latest.current_period_end
          ? adminSdk.firestore.Timestamp.fromMillis(latest.current_period_end * 1000)
          : null,
        cancelAtPeriodEnd: !!latest.cancel_at_period_end,
        updatedAt: adminSdk.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    // API response (compatible with your UI)
    return res.status(200).json({
      status: latest.status,
      plan: planName,
      priceId,
      currentPeriodEnd: latest.current_period_end,
      cancelAtPeriodEnd: !!latest.cancel_at_period_end,
      active: ['active', 'trialing', 'past_due', 'unpaid'].includes(latest.status),
      subscriptionId: latest.id,
      customerId,
    });
  } catch (e) {
    console.error('subscription-status error', e);
    return res.status(500).json({ error: 'Internal error' });
  }
}


// pages/api/subscription/status.js
// export { default } from "@/pages/api/subscription-status";
