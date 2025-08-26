// pages/api/subscription-status.js
import { stripe } from "@/lib/stripe/stripe";
import { authAdmin } from "@/lib/firebase/firebaseAdmin";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    // ----- Auth -----
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Missing ID token" });

    const decoded = await authAdmin.verifyIdToken(token);
    const email = decoded.email;
    if (!email) return res.status(400).json({ error: "User email missing in token" });

    // ----- Find Customer by email -----
    let customer = null;
    try {
      const search = await stripe.customers.search({
        query: `email:'${email.replace(/'/g, "\\'")}'`,
        limit: 5,
      });
      customer = search?.data?.[0] || null;
    } catch {
      const list = await stripe.customers.list({ email, limit: 5 });
      customer = list?.data?.[0] || null;
    }
    if (!customer) {
      return res.status(200).json({ active: false, status: "no_customer" });
    }

    // ----- List subscriptions (expand ONLY price to keep within 4-level limit) -----
    const subs = await stripe.subscriptions.list({
      customer: customer.id,
      status: "all",
      expand: ["data.items.data.price"], // ✅ safe: do not expand product here
      limit: 10,
    });

    if (!subs?.data?.length) {
      return res.status(200).json({ active: false, status: "no_subscription" });
    }

    // Pick most recent subscription
    const latest = subs.data.sort((a, b) => b.created - a.created)[0];

    // States we treat as "can use the app"
    const ACTIVE_STATES = new Set(["trialing", "active", "past_due", "unpaid"]);
    const isActive = ACTIVE_STATES.has(latest.status);

    // Price object (may be id string or expanded object)
    const priceObj = latest.items?.data?.[0]?.price || null;
    const priceId  = typeof priceObj === "string" ? priceObj : priceObj?.id || null;

    // Optional product name (without deep expand)
    let productName =
      (typeof priceObj === "object" && (priceObj.nickname || null)) || null;

    if (!productName &&
        priceObj &&
        typeof priceObj === "object" &&
        priceObj.product &&
        typeof priceObj.product === "string") {
      try {
        const prod = await stripe.products.retrieve(priceObj.product);
        productName = prod?.name || null;
      } catch {
        // ignore — productName stays null
      }
    }

    // --- ✅ NEW: price details (amount/currency/interval) ---
    // unit_amount is integer minor units (e.g., cents)
    const amountCents =
      typeof priceObj === "object" ? (priceObj.unit_amount ?? null) : null;
    const currency =
      typeof priceObj === "object" ? (priceObj.currency || "usd") : "usd";
    const interval =
      (typeof priceObj === "object" &&
        priceObj.recurring &&
        priceObj.recurring.interval) ? priceObj.recurring.interval : "month";

    // Map priceId -> internal plan key
    const PRICE_MAP = {
      basic: process.env.STRIPE_PRICE_BASIC,
      pro:   process.env.STRIPE_PRICE_PRO,
      elite: process.env.STRIPE_PRICE_ELITE,
    };
    const reverseMap = Object.fromEntries(
      Object.entries(PRICE_MAP)
        .filter(([, v]) => !!v)
        .map(([k, v]) => [v, k])
    );
    const planKey = priceId ? (reverseMap[priceId] || null) : null;

    return res.status(200).json({
      // existing fields
      active: !!isActive,
      status: latest.status,
      plan: planKey,                 // "basic" | "pro" | "elite" | null
      priceId,
      productName,
      currentPeriodEnd: latest.current_period_end, // unix seconds
      subscriptionId: latest.id,
      customerId: customer.id,

      // ✅ NEW fields for UI
      amountCents,                   // e.g., 9900 for $99.00
      currency: String(currency || "usd").toLowerCase(), // 'usd', 'gbp', ...
      interval,                      // 'month' | 'year' | 'week' | 'day'
    });
  } catch (err) {
    console.error("subscription-status error:", err);
    return res.status(500).json({
      error: "Failed to fetch subscription status",
      detail: err?.message,
    });
  }
}
