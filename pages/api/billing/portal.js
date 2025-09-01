// pages/api/billing/portal.js
import { stripe } from "@/lib/stripe/stripe";
import { authAdmin } from "@/lib/firebase/firebaseAdmin";

/** Find or create a Stripe Customer by email */
async function findOrCreateCustomerByEmail(email, uid) {
  try {
    const search = await stripe.customers.search({
      query: `email:'${String(email).replace(/'/g, "\\'")}'`,
      limit: 1,
    });
    if (search?.data?.length) return search.data[0].id;
  } catch {}
  try {
    const list = await stripe.customers.list({ email, limit: 1 });
    if (list?.data?.length) return list.data[0].id;
  } catch {}
  const created = await stripe.customers.create({
    email,
    metadata: uid ? { uid } : undefined,
  });
  return created.id;
}

/** Pick a target subscription and expose minimal state */
async function pickTargetSubscription(customerId) {
  const subs = await stripe.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 20,
  });
  if (!subs?.data?.length) return null;

  // Prefer one scheduled to cancel (so we can show Resume)
  const scheduled = subs.data.find((s) => s.cancel_at_period_end === true);
  if (scheduled) {
    return { id: scheduled.id, cancelAtPeriodEnd: true, status: scheduled.status };
  }

  // Else latest active-ish
  const ACTIVE = new Set(["trialing", "active", "past_due", "unpaid"]);
  const activeSorted = subs.data
    .filter((s) => ACTIVE.has(s.status))
    .sort((a, b) => b.created - a.created);
  if (activeSorted[0]) {
    const s = activeSorted[0];
    return { id: s.id, cancelAtPeriodEnd: !!s.cancel_at_period_end, status: s.status };
  }

  // Fallback: newest of any status
  const latest = subs.data.sort((a, b) => b.created - a.created)[0];
  return { id: latest.id, cancelAtPeriodEnd: !!latest.cancel_at_period_end, status: latest.status };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    // ----- Auth -----
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Missing ID token" });

    const decoded = await authAdmin.verifyIdToken(token);
    const email = decoded.email;
    if (!email) return res.status(400).json({ error: "User email is required" });

    const { intent } = (req.body && typeof req.body === "object") ? req.body : {};
    const customerId = await findOrCreateCustomerByEmail(email, decoded.uid);

    // Always point back to /utility
    const base = (
      process.env.NEXT_PUBLIC_SITE_URL ||
      process.env.SITE_URL ||
      process.env.NEXT_PUBLIC_BASE_URL ||
      "http://localhost:3000"
    ).toString().replace(/\/$/, "");

    const afterCompletion = {
      type: "redirect",
      redirect: { return_url: `${base}/utility` },
    };

    // For cancel/resume/update we try to bind to a specific subscription
    let target = null;
    if (intent === "cancel" || intent === "resume" || intent === "update") {
      target = await pickTargetSubscription(customerId);
      if (!target) {
        const generic = await stripe.billingPortal.sessions.create({
          customer: customerId,
          return_url: `${base}/utility`,
        });
        return res.status(200).json({ url: generic.url });
      }
    }

    // Helper: generic (full) portal — shows Resume when cancel_at_period_end is true
    const openGenericPortal = () =>
      stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${base}/utility`,
      });

    let portal;

    if (intent === "resume") {
      // ✔ If a cancel is scheduled, open the full portal (Resume button lives here).
      if (target?.cancelAtPeriodEnd) {
        portal = await openGenericPortal();
      } else {
        // No cancel scheduled → update flow is fine
        portal = await stripe.billingPortal.sessions.create({
          customer: customerId,
          return_url: `${base}/utility`,
          flow_data: {
            type: "subscription_update",
            subscription_update: target?.id ? { subscription: target.id } : {},
            after_completion: afterCompletion,
          },
        });
      }
    } else if (intent === "cancel") {
      // If already scheduled to cancel, cancel-flow can 400 — send to generic so they can Resume or manage.
      if (target?.cancelAtPeriodEnd) {
        portal = await openGenericPortal();
      } else {
        portal = await stripe.billingPortal.sessions.create({
          customer: customerId,
          return_url: `${base}/utility`,
          flow_data: {
            type: "subscription_cancel",
            subscription_cancel: { subscription: target.id },
            after_completion: afterCompletion,
          },
        });
      }
    } else if (intent === "update") {
      portal = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${base}/utility`,
        flow_data: {
          type: "subscription_update",
          subscription_update: target?.id ? { subscription: target.id } : {},
          after_completion: afterCompletion,
        },
      });
    } else {
      // No intent → generic
      portal = await openGenericPortal();
    }

    return res.status(200).json({ url: portal.url });
  } catch (e) {
    console.error("portal error", e);
    return res.status(500).json({ error: "Internal error" });
  }
}
