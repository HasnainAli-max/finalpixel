// pages/api/portal.js
import { stripe } from "@/lib/stripe/stripe";
import { authAdmin } from "@/lib/firebase/firebaseAdmin";

async function findOrCreateCustomerByEmail(email, uid) {
  try {
    const result = await stripe.customers.search({ query: `email:'${email}'` });
    if (result.data[0]) return result.data[0].id;
  } catch {}
  const list = await stripe.customers.list({ email, limit: 1 });
  if (list.data[0]) return list.data[0].id;
  const created = await stripe.customers.create({ email, metadata: { uid } });
  return created.id;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Missing ID token" });

    const decoded = await authAdmin.verifyIdToken(token);
    const email = decoded.email;
    if (!email) return res.status(400).json({ error: "User email is required" });

    const customerId = await findOrCreateCustomerByEmail(email, decoded.uid);

    // Use env base URL if present; fallback to finalpixel
    const base = ("https://finalpixel.vercel.app")
      .toString()
      .replace(/\/$/, "");

    const portal = await stripe.billingPortal.sessions.create({
      customer: customerId,
      // Redirect back to Accounts automatically after the user exits portal
      return_url: `${base}/accounts`,
    });

    return res.status(200).json({ url: portal.url });
  } catch (e) {
    console.error("portal error", e);
    return res.status(500).json({ error: "Internal error" });
  }
}


// pages/api/portal.js
// export { default } from "@/pages/api/billing/portal";

