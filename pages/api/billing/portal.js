// pages/api/billing/portal.js
import { stripe } from "@/lib/stripe/stripe";
import { authAdmin } from "@/lib/firebase/firebaseAdmin";

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

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  try {
    // ---- Auth (Firebase) ----
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Missing ID token" });

    let decoded;
    try {
      decoded = await authAdmin.verifyIdToken(token);
    } catch (e) {
      const isDevOrEmu =
        process.env.NODE_ENV !== "production" ||
        !!process.env.FIREBASE_AUTH_EMULATOR_HOST;
      if (isDevOrEmu) decoded = b64urlDecodeJwtUnsafe(token);
      else throw e;
    }

    const email = decoded?.email;
    if (!email) return res.status(400).json({ error: "User email is required" });

    const customerId = await findOrCreateCustomerByEmail(email, decoded?.uid || null);

    // ---- Base URL (Origin preferred) ----
    const originHeader = typeof req.headers.origin === "string" ? req.headers.origin : "";
    const preferredBase = /^https?:\/\//.test(originHeader) ? originHeader : null;
    const envBase = (
      process.env.NEXT_PUBLIC_SITE_URL ||
      process.env.SITE_URL ||
      process.env.NEXT_PUBLIC_BASE_URL ||
      "https://finalpixel.vercel.app"
    );
    const base = (preferredBase || envBase).toString().replace(/\/$/, "");
    const utilityUrl = `${base}/utility`;   // deep-link flow completion
    const accountsUrl = `${base}/accounts`; // generic portal return

    // Optional deep-link via body.intent
    const intent = (req.body?.intent || "").toString().toLowerCase();

    const params = {
      customer: customerId,
      return_url: accountsUrl, // keep your original behavior
    };

    if (intent === "update" || intent === "cancel") {
      // pick best sub
      let subId = null;
      try {
        const subs = await stripe.subscriptions.list({
          customer: customerId,
          status: "all",
          limit: 10,
        });
        const best =
          subs.data.find((s) => s.status === "active") ||
          subs.data.find((s) => s.status === "trialing") ||
          subs.data[0];
        subId = best?.id || null;
      } catch {}

      if (intent === "cancel" && subId) {
        // fetch to see if already canceling/canceled (avoid Stripe 400)
        let sub;
        try { sub = await stripe.subscriptions.retrieve(subId); } catch {}
        const alreadyCanceling = !!sub?.cancel_at_period_end;
        const alreadyCanceled  = sub?.status === "canceled";

        if (alreadyCanceling || alreadyCanceled) {
          // Send them to update flow so they can Resume or change plan
          params.flow_data = {
            type: "subscription_update",
            subscription_update: { subscription: subId },
            after_completion: { type: "redirect", redirect: { return_url: utilityUrl } },
          };
        } else {
          params.flow_data = {
            type: "subscription_cancel",
            subscription_cancel: { subscription: subId },
            after_completion: { type: "redirect", redirect: { return_url: utilityUrl } },
          };
        }
      } else if (intent === "update") {
        params.flow_data = {
          type: "subscription_update",
          ...(subId ? { subscription_update: { subscription: subId } } : {}),
          after_completion: { type: "redirect", redirect: { return_url: utilityUrl } },
        };
      }
    }

    const portal = await stripe.billingPortal.sessions.create(params);
    return res.status(200).json({ url: portal.url });
  } catch (e) {
    console.error("portal error", e);
    return res.status(500).json({ error: "Internal error" });
  }
}
