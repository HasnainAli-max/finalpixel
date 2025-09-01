// lib/billing/quota.js
import { authAdmin, db, FieldValue } from '@/lib/firebase/firebaseAdmin';
import { stripe } from '@/lib/stripe/server';
import { limitForPlan, todayKey } from '@/lib/billing/limit';

/** Map Stripe price -> plan label used in your app. */
function planFromPrice(price) {
  const priceId = price?.id;
  const nickname = price?.nickname?.toLowerCase?.() || '';
  const lookupKey = price?.lookup_key?.toLowerCase?.() || '';

  const envMap = {
    [process.env.STRIPE_PRICE_BASIC]: 'basic',
    [process.env.STRIPE_PRICE_PRO]: 'pro',
    [process.env.STRIPE_PRICE_ELITE]: 'elite',
  };
  if (priceId && envMap[priceId]) return envMap[priceId];

  if (lookupKey.includes('basic') || nickname.includes('basic')) return 'basic';
  if (lookupKey.includes('pro')   || nickname.includes('pro'))   return 'pro';
  if (lookupKey.includes('elite') || nickname.includes('elite')) return 'elite';
  return null;
}

/** A subscription counts if it's active/trialing (and not expired). */
function isUsable(sub) {
  const allowed = new Set(['active', 'trialing']);
  if (!allowed.has(sub.status)) return false;
  if (sub.cancel_at_period_end) return (sub.current_period_end * 1000) > Date.now();
  return true;
}

/** Get current plan ('basic'|'pro'|'elite') from Stripe. */
async function getPlanFromStripeCustomer(stripeCustomerId) {
  const subs = await stripe.subscriptions.list({
    customer: stripeCustomerId,
    status: 'all',
    expand: ['data.items.data.price'],
    limit: 10,
  });
  const active = subs.data.find(isUsable);
  if (!active) return null;
  return planFromPrice(active.items?.data?.[0]?.price || null);
}

/** Resolve Stripe customer id, cache on user doc if found/created. */
async function resolveStripeCustomerId({ uid, userRef }) {
  const snap = await userRef.get();
  const userDoc = snap.exists ? snap.data() : {};
  if (userDoc?.stripeCustomerId) return userDoc.stripeCustomerId;

  // Search by metadata
  try {
    const byUid = await stripe.customers.search({
      query: `metadata['uid']:'${uid.replace(/'/g, "\\'")}'`,
      limit: 10,
    });
    if (byUid.data.length) {
      const customerId = byUid.data.sort((a, b) => b.created - a.created)[0].id;
      await userRef.set({ stripeCustomerId: customerId }, { merge: true });
      return customerId;
    }
  } catch (_) {}

  // Try by email
  const authUser = await authAdmin.getUser(uid).catch(() => null);
  const email = authUser?.email || '';
  if (email) {
    try {
      const byEmail = await stripe.customers.search({
        query: `email:'${email.replace(/'/g, "\\'")}'`,
        limit: 10,
      });
      if (byEmail.data.length) {
        const customerId = byEmail.data.sort((a, b) => b.created - a.created)[0].id;
        await userRef.set({ stripeCustomerId: customerId }, { merge: true });
        return customerId;
      }
    } catch {
      const list = await stripe.customers.list({ email, limit: 10 });
      if (list.data.length) {
        const customerId = list.data.sort((a, b) => b.created - a.created)[0].id;
        await userRef.set({ stripeCustomerId: customerId }, { merge: true });
        return customerId;
      }
    }
  }

  // Auto-create if still not found
  const created = await stripe.customers.create({
    email: email || undefined,
    metadata: { uid },
    description: `App user ${uid}`,
  });
  await userRef.set({ stripeCustomerId: created.id }, { merge: true });
  return created.id;
}

/**
 * Stripe-first daily quota.
 * Throws Error with .code = 'NO_PLAN' | 'LIMIT_EXCEEDED'
 */
export async function checkAndConsumeQuota({ uid }) {
  if (!uid) {
    const e = new Error('Missing uid');
    e.code = 'NO_PLAN';
    throw e;
  }

  const userRef = db.collection('users').doc(uid);
  const stripeCustomerId = await resolveStripeCustomerId({ uid, userRef });
  const plan = await getPlanFromStripeCustomer(stripeCustomerId);

  if (!plan) {
    const e = new Error('No active subscription found on Stripe.');
    e.code = 'NO_PLAN';
    throw e;
  }

  const max = limitForPlan(plan);
  if (max <= 0) {
    const e = new Error('No active plan. Please buy a plan first.');
    e.code = 'NO_PLAN';
    throw e;
  }

  const quotaRef = userRef.collection('quota').doc('daily');
  const today = todayKey();

  // 🔑 Transaction ensures atomic counter
  await db.runTransaction(async (t) => {
    const snap = await t.get(quotaRef);
    const sameDay = snap.exists && snap.get('day') === today;
    const used = sameDay ? Number(snap.get('count') || 0) : 0;

    if (used >= max) {
      const e = new Error(`Daily limit reached for your ${plan} plan (${max}/day).`);
      e.code = 'LIMIT_EXCEEDED';
      throw e;
    }

    t.set(
      quotaRef,
      {
        day: today,
        count: used + 1,
        max,
        plan,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });

  return { uid, plan, max };
}
