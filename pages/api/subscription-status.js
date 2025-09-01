// pages/api/subscription-status.js
import { stripe } from "@/lib/stripe/stripe";
import { authAdmin } from "@/lib/firebase/firebaseAdmin";

// Map env price IDs -> internal plan keys
const PRICE_MAP = {
  basic: process.env.STRIPE_PRICE_BASIC,
  pro: process.env.STRIPE_PRICE_PRO,
  elite: process.env.STRIPE_PRICE_ELITE,
};
const reverseMap = Object.fromEntries(
  Object.entries(PRICE_MAP)
    .filter(([, v]) => !!v)
    .map(([k, v]) => [v, k])
);

// Helpers
function b64urlDecodeJwtUnsafe(token) {
  try {
    const part = String(token || "").split(".")[1] || "";
    const pad = "=".repeat((4 - (part.length % 4)) % 4);
    const base = (part + pad).replace(/-/g, "+").replace(/_/g, "/");
    const json = Buffer.from(base, "base64").toString("utf8");
    return JSON.parse(json);
  } catch {
    return {};
  }
}

function formatPrice(amountCents, currency = "usd", interval = "month") {
  if (typeof amountCents !== "number") return null;
  const unit = (amountCents / 100).toFixed(2);
  const code = String(currency || "usd").toUpperCase();
  const every = interval ? ` / ${interval}` : "";
  return `${code} ${unit}${every}`;
}

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  try {
    // ----- Auth -----
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Missing ID token" });

    let decoded;
    try {
      decoded = await authAdmin.verifyIdToken(token);
    } catch (e) {
      // Emulator/dev fallback: keep page usable without strict Admin verify
      if (
        process.env.NODE_ENV !== "production" ||
        process.env.FIREBASE_AUTH_EMULATOR_HOST
      ) {
        decoded = b64urlDecodeJwtUnsafe(token);
      } else {
        throw e;
      }
    }

    const email = decoded?.email;
    if (!email)
      return res.status(400).json({ error: "User email missing in token" });

    // ----- Find Customer by email (prefer search, fallback list) -----
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

    // ----- Subscriptions (expand price only) -----
    const subs = await stripe.subscriptions.list({
      customer: customer.id,
      status: "all",
      expand: ["data.items.data.price"],
      limit: 10,
    });

    if (!subs?.data?.length) {
      return res
        .status(200)
        .json({ active: false, status: "no_subscription" });
    }

    // Most recent sub
    const latest = subs.data.sort((a, b) => b.created - a.created)[0];

    // States that still allow access
    const ACTIVE_STATES = new Set(["trialing", "active", "past_due", "unpaid"]);
    const isActive = ACTIVE_STATES.has(latest.status);

    // Price details
    const priceObj = latest.items?.data?.[0]?.price || null;
    const priceId =
      typeof priceObj === "string" ? priceObj : priceObj?.id || null;

    // Product/plan display name
    let productName =
      (typeof priceObj === "object" && (priceObj.nickname || null)) || null;

    if (
      !productName &&
      priceObj &&
      typeof priceObj === "object" &&
      priceObj.product &&
      typeof priceObj.product === "string"
    ) {
      try {
        const prod = await stripe.products.retrieve(priceObj.product);
        productName = prod?.name || null;
      } catch {
        // ignore
      }
    }

    // Raw price fields for UI
    const amountCents =
      typeof priceObj === "object" ? priceObj.unit_amount ?? null : null;
    const currency =
      typeof priceObj === "object" ? priceObj.currency || "usd" : "usd";
    const interval =
      typeof priceObj === "object" && priceObj.recurring?.interval
        ? priceObj.recurring.interval
        : "month";

    const priceDisplay = formatPrice(amountCents, currency, interval);

    // Internal plan key
    const planKey = priceId ? reverseMap[priceId] || null : null;

    return res.status(200).json({
      // access control
      active: !!isActive,
      status: latest.status,

      // plan + price
      plan: planKey,
      productName,
      priceId,
      amountCents,
      currency: String(currency || "usd").toLowerCase(),
      interval,
      priceDisplay,

      // ids + dates
      currentPeriodEnd: latest.current_period_end, // unix seconds
      subscriptionId: latest.id,
      customerId: customer.id,
    });
  } catch (err) {
    console.error("subscription-status error:", err);
    return res.status(500).json({
      error: "Failed to fetch subscription status",
      detail: err?.message,
    });
  }
}



// export { default } from "@/pages/api/subscription-status";
