// pages/api/billing/portal.js
import { authAdmin, db } from "@/lib/firebase/firebaseAdmin";
import { stripe } from "@/lib/stripe/stripe";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    // 1) Verify Firebase ID token (required)
    const authHeader = req.headers.authorization || "";
    const idToken = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : null;

    if (!idToken) {
      return res.status(401).json({ error: "Missing Authorization Bearer token" });
    }

    const decoded = await authAdmin.verifyIdToken(idToken);
    const uid = decoded.uid;

    // 2) Load Firestore user to get Stripe IDs
    const snap = await db.collection("users").doc(uid).get();
    if (!snap.exists) {
      return res.status(404).json({ error: "User doc not found" });
    }
    const user = snap.data();

    const customerId = user.stripeCustomerId;
    const subscriptionId = user.subscriptionId || null;

    if (!customerId) {
      return res.status(400).json({ error: "No stripeCustomerId on user" });
    }

    // 3) Build optional flow_data correctly
    const { action } = req.body || {};
    let flow_data = undefined;

    // If you want to force-open a specific flow:
    if (action === "cancel" && subscriptionId) {
      flow_data = {
        type: "subscription_cancel",
        subscription_cancel: {
          subscription: subscriptionId,
          // optional extras:
          // cancellation_reason: { enabled: true },
          // proration_behavior: "always_invoice",
        },
      };
    } else if ((action === "upgrade" || action === "downgrade") && subscriptionId) {
      flow_data = {
        type: "subscription_update",
        subscription_update: {
          subscription: subscriptionId,
          // optional: default_allowed_updates, items, etc.
        },
      };
    }
    // If action is anything else (or missing), we open the generic portal
    // by NOT sending flow_data at all.

    // 4) Compute a safe return URL
    const origin =
      process.env.APP_URL ||
      `${req.headers["x-forwarded-proto"] || "http"}://${req.headers.host}`;
    const return_url = `${origin}/accounts`;

    // 5) Create the Billing Portal session
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url,
      ...(flow_data ? { flow_data } : {}),
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error("[portal] error:", err);
    // Bubble up Stripe’s helpful message (the one you saw)
    return res.status(400).json({ error: err.message });
  }
}
