import Head from "next/head";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "@/lib/firebase/config";
import Navbar from "@/components/Navbar";

export default function Accounts() {
  const router = useRouter();
  const [authUser, setAuthUser] = useState(null);
  const [userDoc, setUserDoc] = useState(null);

  // Loading controls
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [loadingStripe, setLoadingStripe] = useState(true);
  const loading = loadingProfile || loadingStripe;

  const [busy, setBusy] = useState(false);

  // 🔐 Stripe subscription snapshot (Stripe is SOURCE OF TRUTH)
  const [stripeSub, setStripeSub] = useState({
    active: false,
    status: "inactive",
    plan: null,               // "basic" | "pro" | "elite" | null
    productName: null,
    priceId: null,
    currentPeriodEnd: null,   // unix seconds or millis
    amountCents: null,
    currency: "usd",
    interval: "month",
    customerId: null,
    subscriptionId: null,
  });

  // ---------- Custom Modal State ----------
  const [modal, setModal] = useState({
    open: false,
    title: "",
    message: "",
    actions: [], // [{ label, onClick }]
  });
  const openModal = ({ title, message, actions = [] }) =>
    setModal({ open: true, title, message, actions });
  const closeModal = () => setModal((m) => ({ ...m, open: false }));

  // 1) redirect to /login if not signed in
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) {
        router.replace("/login");
      } else {
        setAuthUser(u);
      }
    });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2) watch the user's Firestore doc (profile ONLY; no subscription fields!)
  useEffect(() => {
    if (!authUser?.uid) return;
    const unsub = onSnapshot(
      doc(db, "users", authUser.uid),
      (snap) => {
        setUserDoc(snap.exists() ? snap.data() : null);
        setLoadingProfile(false);
      },
      (err) => {
        console.error("Account load error:", err);
        setLoadingProfile(false);
      }
    );
    return () => unsub();
  }, [authUser?.uid]);

  // 3) fetch subscription from Stripe (server route)
  const fetchingRef = useRef(false);
  const fetchStripeStatus = async () => {
    if (!authUser || fetchingRef.current) return;
    fetchingRef.current = true;
    setLoadingStripe(true);
    try {
      const token = await auth.currentUser.getIdToken();
      const res = await fetch("/api/subscription-status", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          // 🚫 caching
          "Cache-Control": "no-cache",
          "Pragma": "no-cache",
        },
        cache: "no-store",
      });
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch { throw new Error(text); }

      if (!res.ok) {
        console.warn("subscription-status error:", data?.error || res.status);
        setStripeSub((s) => ({ ...s, active: false, status: "inactive" }));
      } else {
        setStripeSub({
          active: !!data.active,
          status: data.status || "inactive",
          plan: data.plan || null,
          productName: data.productName || null,
          priceId: data.priceId || null,
          currentPeriodEnd: data.currentPeriodEnd || null,
          amountCents: data.amountCents ?? null,
          currency: (data.currency || "usd").toLowerCase(),
          interval: data.interval || "month",
          customerId: data.customerId || null,
          subscriptionId: data.subscriptionId || null,
        });
      }
    } catch (e) {
      console.warn("subscription-status fetch failed:", e);
      setStripeSub((s) => ({ ...s, active: false, status: "inactive" }));
    } finally {
      setLoadingStripe(false);
      fetchingRef.current = false;
    }
  };

  // initial fetch
  useEffect(() => {
    fetchStripeStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser]);

  // instant refresh: broadcast listener + refetch on tab focus/visibility
  useEffect(() => {
    // BroadcastChannel (checkout success page or other tabs will ping this)
    let bc;
    try {
      bc = new BroadcastChannel("pp-billing-sync");
      bc.addEventListener("message", (ev) => {
        if (ev?.data === "refresh") {
          fetchStripeStatus();
        }
      });
    } catch {}
    // visibility change (returning from Stripe or switching tabs)
    const onVis = () => {
      if (document.visibilityState === "visible") fetchStripeStatus();
    };
    document.addEventListener("visibilitychange", onVis);
    // explicit focus event also helps on some browsers
    const onFocus = () => fetchStripeStatus();
    window.addEventListener("focus", onFocus);

    return () => {
      if (bc) bc.close();
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // sign out (no toasts; same behavior)
  const handleSignOut = async () => {
    try {
      await signOut(auth);
      router.replace("/login");
    } catch {
      openModal({
        title: "Sign out failed",
        message: "We could not sign you out. Please try again.",
        actions: [{ label: "Try Again", onClick: () => { closeModal(); handleSignOut(); } }],
      });
    }
  };

  // 5) open Stripe Customer Portal (intent optional: 'update' | 'cancel')
  async function openPortal(intent) {
    try {
      setBusy(true);
      const token = await auth.currentUser.getIdToken();
      const res = await fetch("/api/billing/portal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch { throw new Error(text); }
      if (!res.ok) throw new Error(data.error || "Failed to open billing portal");

      // small delay for UX then redirect
      setTimeout(() => { window.location.href = data.url; }, 200);
    } catch (e) {
      console.error("openPortal error:", e);
      openModal({
        title: "Unable to open portal",
        message: e?.message || "We couldn't open the customer portal. Please try again.",
        actions: [{ label: "Try Again", onClick: () => { closeModal(); openPortal(intent); } }],
      });
    } finally {
      setBusy(false);
    }
  }

  // Guarded handlers for Update/Cancel buttons
  const handleUpdateClick = () => {
    if (!stripeSub.active) {
      openModal({
        title: "No active subscription",
        message: "You don't have an active plan. First buy the plan, then you can update it.",
        actions: [
          { label: "Buy a Plan", onClick: () => { closeModal(); router.push("/"); } },
        ],
      });
      return;
    }
    openPortal("update");
  };

  const handleCancelClick = () => {
    if (!stripeSub.active) {
      openModal({
        title: "No active subscription",
        message: "You don't have an active plan. First buy the plan, then you can cancel it.",
        actions: [
          { label: "Buy a Plan", onClick: () => { closeModal(); router.push("/"); } },
        ],
      });
      return;
    }
    // Confirm cancel modal
    openModal({
      title: "Cancel subscription?",
      message: "You’ll be taken to Stripe to cancel your subscription. You can resume later if you change your mind.",
      actions: [
        { label: "Continue to Cancel", onClick: () => { closeModal(); openPortal("cancel"); } },
        { label: "Keep Plan", onClick: () => closeModal() },
      ],
    });
  };

  // 4) derived values for UI (Stripe-first)
  const view = useMemo(() => {
    const name =
      userDoc?.displayName ||
      [userDoc?.firstName, userDoc?.lastName].filter(Boolean).join(" ") ||
      authUser?.displayName ||
      "—";

    const loginEmail = authUser?.email || userDoc?.email || "—";
    const billingEmail = userDoc?.stripeCustomer?.email || userDoc?.email || loginEmail;

    const planKey = stripeSub.plan;
    const plan = planKey ? planKey.charAt(0).toUpperCase() + planKey.slice(1) : "No plan";
    const status = stripeSub.status || "inactive";

    let amount = "—";
    if (typeof stripeSub.amountCents === "number") {
      const dollars = (stripeSub.amountCents / 100).toFixed(2);
      amount = `$${dollars}`;
    }

    const renewDate = formatDate(stripeSub.currentPeriodEnd);
    const intervalSuffix = stripeSub.interval === "year" ? " / yr" : (stripeSub.interval ? " / mo" : "");

    return { name, loginEmail, billingEmail, plan, amount, status, renewDate, intervalSuffix };
  }, [userDoc, authUser, stripeSub]);

  if (loading) {
    return (
      <main className="min-h-screen grid place-items-center text-slate-600 dark:text-slate-300">
        Loading account…
      </main>
    );
  }
  if (!authUser) return null;

  return (
    <>
      <Head>
        <title>Account – PixelProof</title>
      </Head>

      {/* Same Navbar as Utility page */}
      <Navbar user={authUser} onSignOut={handleSignOut} />

      <main className="min-h-screen bg-gradient-to-b from-[#f7f8ff] to-white dark:from-slate-950 dark:to-slate-900">
        {/* spacer row kept */}
        <div className="max-w-6xl mx-auto px-6 pt-8 pb-4 flex items-center justify-end gap-3" />

        <div className="max-w-6xl mx-auto px-6 pb-14 grid lg:grid-cols-3 gap-6">
          {/* Profile */}
          <section className="lg:col-span-2 bg-white dark:bg-slate-800 rounded-2xl shadow-sm ring-1 ring-black/5 dark:ring-white/10 p-6">
            <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-6">Profile</h2>

            <div className="flex items-center gap-4 mb-6">
              <div className="h-14 w-14 flex items-center justify-center rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-200 font-bold">
                {initials(view.name)}
              </div>
              <div>
                <div className="text-slate-900 dark:text-slate-100 font-semibold">{view.name}</div>
                <div className="text-slate-600 dark:text-slate-300 text-sm">{view.loginEmail}</div>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 bg-slate-50 dark:bg-slate-700/60">
                <div className="text-slate-600 dark:text-slate-300 text-sm mb-1">Billing email</div>
                <div className="font-semibold text-slate-900 dark:text-slate-100">{view.billingEmail}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">(different email is okay)</div>
              </div>

              <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 bg-slate-50 dark:bg-slate-700/60">
                <div className="text-slate-600 dark:text-slate-300 text-sm mb-1">Login email</div>
                <div className="font-semibold text-slate-900 dark:text-slate-100">{view.loginEmail}</div>
              </div>
            </div>
          </section>

          {/* Plan (Stripe-driven) */}
          <aside className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm ring-1 ring-black/5 dark:ring-white/10 p-6">
            <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-4">Current Plan</h2>

            <div className="rounded-2xl border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-950/40 p-5 mb-5 relative">
              <div className="absolute right-3 top-3">
                <span
                  className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                    stripeSub.active
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                      : "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300"
                  }`}
                >
                  {view.status}
                </span>
              </div>

              <div className="text-slate-800 dark:text-slate-100 font-semibold">
                {view.plan}
                {stripeSub.productName ? ` — ${stripeSub.productName}` : ""}
              </div>

              <div className="mt-1">
                <span className="text-3xl font-extrabold text-slate-900 dark:text-white">
                  {view.amount}
                </span>
                <span className="text-slate-600 dark:text-slate-300">
                  {view.amount !== "—" ? view.intervalSuffix : ""}
                </span>
              </div>

              <div className="text-slate-600 dark:text-slate-300 text-sm mt-2">
                {view.renewDate ? `Renews on ${view.renewDate}` : "No renewal scheduled"}
              </div>
            </div>

            <div className="space-y-3">
              {/* Update plan via Stripe portal (guarded) */}
              <button
                type="button"
                disabled={busy}
                onClick={handleUpdateClick}
                className="w-full h-11 rounded-xl bg-[#6c2bd9] text-white font-medium shadow-sm hover:brightness-95 disabled:opacity-50 transition"
              >
                Update plan
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={handleCancelClick}
                className="w-full h-11 rounded-xl border border-amber-300 dark:border-amber-600 text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/30 font-medium hover:bg-amber-100 dark:hover:bg-amber-900/50 disabled:opacity-50 transition"
              >
                Cancel subscription
              </button>
            </div>
          </aside>
        </div>
      </main>

      {/* ---------- Custom Modal ---------- */}
      <div
        className={`fixed inset-0 z-[100] transition-opacity duration-200 ${modal.open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
        onClick={closeModal}
        aria-hidden={!modal.open}
      >
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/40" />

        {/* Panel */}
        <div className="absolute inset-0 flex items-center justify-center p-4">
          <div
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            className={`w-full max-w-md rounded-xl bg-white dark:bg-gray-900 shadow-2xl border border-gray-200 dark:border-gray-800 p-5 transform transition-all duration-200
              ${modal.open ? "opacity-100 scale-100 translate-y-0" : "opacity-0 scale-95 translate-y-2"}
            `}
          >
            <div className="flex items-start justify-between mb-3">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{modal.title}</h3>
              <button
                onClick={closeModal}
                aria-label="Close"
                className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
              >
                {/* X icon */}
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>

            <p className="text-sm text-gray-700 dark:text-gray-300 mb-5">{modal.message}</p>

            <div className="flex flex-wrap gap-3 justify-end">
              {modal.actions?.map((a, idx) => (
                <button
                  key={idx}
                  onClick={a.onClick}
                  className="bg-purple-800 hover:bg-purple-900 text-white px-4 py-2 rounded-lg font-semibold shadow transition"
                >
                  {a.label}
                </button>
              ))}
              {(!modal.actions || modal.actions.length === 0) && (
                <button
                  onClick={closeModal}
                  className="bg-purple-800 hover:bg-purple-900 text-white px-4 py-2 rounded-lg font-semibold shadow transition"
                >
                  Close
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/* ---------- helpers ---------- */
function initials(name = "") {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() || "").join("") || "PP";
}

function formatDate(tsLike) {
  if (!tsLike) return "";
  if (typeof tsLike?.toDate === "function") return tsLike.toDate().toLocaleDateString();
  if (typeof tsLike === "number") {
    const ms = tsLike > 1e12 ? tsLike : tsLike * 1000;
    return new Date(ms).toLocaleDateString();
  }
  const d = new Date(tsLike);
  return isNaN(d) ? "" : d.toLocaleDateString();
}
