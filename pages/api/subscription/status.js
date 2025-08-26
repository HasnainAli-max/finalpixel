import { stripe } from '@/lib/stripe/stripe';
import { authAdmin, db, adminSdk } from '@/lib/firebase/firebaseAdmin';
import { PLAN_BY_PRICE } from '@/utils/stripePlan';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Missing ID token' });
    const { uid } = await authAdmin.verifyIdToken(token);

    const uref = db.collection('users').doc(uid);
    const usnap = await uref.get();
    const customerId = usnap.get('stripeCustomerId');
    if (!customerId) return res.status(200).json({ status: 'no_customer' });

    // Get latest active (or trialing) sub
    const subs = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 10 });
    const sub = subs.data.find(s => ['active','trialing','past_due','unpaid','canceled','incomplete'].includes(s.status)) || null;

    let response = { status: 'no_subscription' };
    if (sub) {
      const item = sub.items.data[0];
      const priceId = item?.price?.id || null;
      const planName = priceId ? (PLAN_BY_PRICE[priceId] || 'unknown') : 'unknown';

      await uref.set({
        priceId,
        activePlan: planName,
        subscriptionStatus: sub.status,
        currentPeriodStart: sub.current_period_start ? adminSdk.firestore.Timestamp.fromMillis(sub.current_period_start * 1000) : null,
        currentPeriodEnd: sub.current_period_end ? adminSdk.firestore.Timestamp.fromMillis(sub.current_period_end * 1000) : null,
        cancelAtPeriodEnd: !!sub.cancel_at_period_end,
        updatedAt: adminSdk.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      response = {
        status: sub.status,
        plan: planName,
        priceId,
        currentPeriodEnd: sub.current_period_end,
        cancelAtPeriodEnd: !!sub.cancel_at_period_end,
      };
    }

    res.status(200).json(response);
  } catch (e) {
    console.error('status error', e);
    res.status(500).json({ error: 'Internal error' });
  }
}
