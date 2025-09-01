// pages/api/stripe/webhook.js
import { buffer } from 'micro';
import { stripe } from '@/lib/stripe/stripe';
import { db, FieldValue, Timestamp } from '@/lib/firebase/firebaseAdmin';

export const config = { api: { bodyParser: false } };

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const IS_EMU = !!process.env.FIRESTORE_EMULATOR_HOST;

const PLAN_BY_PRICE = {
  [process.env.STRIPE_PRICE_BASIC]: 'basic',
  [process.env.STRIPE_PRICE_PRO]: 'pro',
  [process.env.STRIPE_PRICE_ELITE]: 'elite',
};

/** -------- Helpers -------- */

function tsOrNull(sec) {
  return typeof sec === 'number' && sec > 0 ? Timestamp.fromMillis(sec * 1000) : null;
}

async function logStripeEvent({ event, rawLength, hint = {}, uid = null }) {
  if (IS_EMU) {
    console.log('[webhook][emu-log]', event?.type, { id: event?.id, uid, hint, rawLength });
    return;
  }
  const obj = event?.data?.object || {};
  const isSubObject = obj?.object === 'subscription';

  const logDoc = {
    id: event.id,
    type: event.type,
    created: event.created ? Timestamp.fromMillis(event.created * 1000) : FieldValue.serverTimestamp(),
    livemode: !!event.livemode,
    apiVersion: event.api_version || null,
    requestId: event.request?.id || null,
    objectType: obj?.object || null,
    stripeCustomerId: obj?.customer || null,
    subscriptionId: isSubObject ? obj?.id : obj?.subscription || null,
    checkoutSessionId: obj?.object === 'checkout.session' ? obj?.id : null,
    uid: uid || null,
    rawSizeBytes: rawLength || null,
    hint,
    receivedAt: FieldValue.serverTimestamp(),
  };

  await db.collection('stripeEvents').doc(event.id).set(logDoc, { merge: true });
}

async function writeFromSubscriptionEvent(subscription) {
  if (IS_EMU) {
    console.log('[webhook][emu-sub]', subscription?.id, subscription?.status);
    return;
  }

  const customerId = subscription.customer;
  const item = subscription.items?.data?.[0];
  const priceId = item?.price?.id || null;
  const plan = priceId ? (PLAN_BY_PRICE[priceId] || 'unknown') : 'unknown';

  const q = await db.collection('users')
    .where('stripeCustomerId', '==', customerId)
    .limit(1)
    .get();

  if (q.empty) {
    await db.collection('stripeOrphans').doc(String(subscription.id)).set({
      reason: 'No user doc with this stripeCustomerId',
      customerId,
      status: subscription.status,
      createdAt: FieldValue.serverTimestamp(),
    });
    return;
  }

  const uid = q.docs[0].id;

  const payload = {
    stripeCustomerId: customerId,
    subscriptionId: subscription.id,
    priceId,
    activePlan: plan,
    subscriptionStatus: subscription.status,        // "active" | "trialing" | "canceled" | "past_due" | ...
    currentPeriodStart: tsOrNull(subscription.current_period_start),
    currentPeriodEnd: tsOrNull(subscription.current_period_end),

    // ---- Cancellation fields (scheduled & executed) ----
    cancelAtPeriodEnd: !!subscription.cancel_at_period_end, // user scheduled end-of-period cancel
    cancelAt: tsOrNull(subscription.cancel_at),             // scheduled cancel timestamp (seconds -> TS)
    canceledAt: tsOrNull(subscription.canceled_at),         // when Stripe executed cancel
    endedAt: tsOrNull(subscription.ended_at),               // when access ended (usually == canceledAt or period end)
    pauseBehavior: subscription.pause_collection?.behavior || null, // "void", "keep_as_draft", "mark_uncollectible"

    // Price visuals
    currency: item?.price?.currency || null,
    amount: item?.price?.unit_amount ?? null,
    productId: item?.price?.product || null,

    updatedAt: FieldValue.serverTimestamp(),
  };

  // If subscription is fully canceled, keep fields but we can also mark plan as last known.
  // (Front-end is Stripe-first anyway.)
  await db.collection('users').doc(uid).set(payload, { merge: true });
}

async function handleCheckoutCompleted(session) {
  if (session.mode !== 'subscription') return { note: 'ignored non-subscription session' };

  const uid = session.metadata?.uid || null;
  const customerId = typeof session.customer === 'string' ? session.customer : null;
  const subscriptionId = typeof session.subscription === 'string' ? session.subscription : null;

  if (!IS_EMU && uid && customerId) {
    const customerDetails = session.customer_details || {};
    await db.collection('users').doc(uid).set(
      {
        stripeCustomerId: customerId,
        lastCheckoutSessionId: session.id,
        stripeCustomer: {
          email: customerDetails.email || null,
          name: customerDetails.name || null,
          address: customerDetails.address || null,
        },
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  } else {
    console.log('[webhook][emu-map]', { uid, customerId, sessionId: session.id });
  }

  if (subscriptionId) {
    try {
      const sub = await stripe.subscriptions.retrieve(subscriptionId, { expand: ['items.data.price'] });
      await writeFromSubscriptionEvent(sub);
    } catch (e) {
      console.warn('[webhook] could not retrieve subscription immediately:', e.message);
    }
  }

  return { uid, customerId, subscriptionId };
}

/** Stripe event parsing (with dev fallback) */
async function parseStripeEvent(req) {
  const sig = req.headers['stripe-signature'];
  const buf = await buffer(req);

  const parsedFromEnv = (WEBHOOK_SECRET || '').trim();
  const secrets = parsedFromEnv
    ? parsedFromEnv.split(',').map(s => s.trim()).filter(Boolean)
    : [];

  for (const secret of secrets) {
    try {
      const ev = stripe.webhooks.constructEvent(buf, sig, secret);
      return { event: ev, rawLength: buf.length, verifiedWith: secret };
    } catch {
      // try next
    }
  }

  const allowInsecure =
    process.env.DEV_WEBHOOK_NO_VERIFY === 'true' || process.env.NODE_ENV !== 'production';

  if (allowInsecure) {
    try {
      const ev = JSON.parse(buf.toString('utf8'));
      return { event: ev, rawLength: buf.length, verifiedWith: null, insecure: true };
    } catch (e) {
      throw new Error('DEV parse failed: ' + e.message);
    }
  }

  throw new Error(
    secrets.length === 0
      ? 'Missing STRIPE_WEBHOOK_SECRET in environment.'
      : 'Webhook signature verification failed.'
  );
}

/** -------- Handler -------- */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end('Method Not Allowed');

  try {
    const { event, rawLength } = await parseStripeEvent(req);
    const { type } = event;

    console.log('🔔', type);
    await logStripeEvent({ event, rawLength });

    // Create/Update/Delete all funnel through the same writer (handles cancellation too)
    if (
      type === 'customer.subscription.created' ||
      type === 'customer.subscription.updated' ||
      type === 'customer.subscription.deleted'
    ) {
      try {
        const subscription = event.data.object;
        await writeFromSubscriptionEvent(subscription);
      } catch (innerErr) {
        console.error('[handler] sub-event write failed:', innerErr?.stack || innerErr?.message || innerErr);
        return res.status(200).json({ received: true, noted: 'sub write failed (see logs)' });
      }
    }

    if (type === 'checkout.session.completed') {
      const session = event.data.object;
      const result = await handleCheckoutCompleted(session);
      await logStripeEvent({
        event,
        rawLength,
        uid: result?.uid || null,
        hint: { mappedFrom: 'checkout.session.completed' },
      });
    }

    // You can add other lifecycle events if you like (paused/resumed etc.) – "updated" covers most states.

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('[webhook] top-level error:', err?.stack || err?.message || err);
    // 200 in dev to avoid retries; in production you might choose 400
    return res.status(200).json({ received: true, warning: String(err?.message || err) });
  }
}
