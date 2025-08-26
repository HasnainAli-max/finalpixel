import Head from "next/head";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "@/lib/firebase/config";
import Navbar from "@/components/Navbar";
import { Toaster, toast } from "sonner";

export default function Accounts() {
  const router = useRouter();
  const [authUser, setAuthUser] = useState(null);
  const [userDoc, setUserDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // sign out (same behavior as utility page) + toast
  const handleSignOut = async () => {
    try {
      await toast.promise(
        signOut(auth),
        {
          loading: "Signing you out…",
          success: "Signed out.",
          error: "Sign out failed. Please try again.",
        }
      );
      router.replace("/login");
    } catch (e) {
      // toast already shown in promise error handler
      console.error("Sign out failed:", e);
    }
  };

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

  // 2) watch the user's Firestore doc (for plan/status/etc.)
  useEffect(() => {
    if (!authUser?.uid) return;
    const unsub = onSnapshot(
      doc(db, "users", authUser.uid),
      (snap) => {
        setUserDoc(snap.exists() ? snap.data() : null);
        setLoading(false);
      },
      (err) => {
        console.error("Account load error:", err);
        toast.error("Couldn't load your account details. Please refresh.");
        setLoading(false);
      }
    );
    return () => unsub();
  }, [authUser?.uid]);

  // 3) derived values for UI
  const view = useMemo(() => {
    const name =
      userDoc?.displayName ||
      [userDoc?.firstName, userDoc?.lastName].filter(Boolean).join(" ") ||
      authUser?.displayName ||
      "—";

    const loginEmail = authUser?.email || userDoc?.email || "—";
    const billingEmail = userDoc?.stripeCustomer?.email || userDoc?.email || loginEmail;

    const planRaw = userDoc?.activePlan || null;
    const plan = planRaw ? planRaw.charAt(0).toUpperCase() + planRaw.slice(1) : "No plan";

    const amount =
      typeof userDoc?.amount === "number" ? (userDoc.amount / 100).toFixed(2) : "—";

    const status = userDoc?.subscriptionStatus || "inactive";
    const renewDate = formatDate(userDoc?.currentPeriodEnd);

    return { name, loginEmail, billingEmail, plan, amount, status, renewDate };
  }, [userDoc, authUser]);

  // 4) open Stripe Customer Portal (intent optional: 'update' | 'cancel')
  async function openPortal(intent) {
    try {
      setBusy(true);
      await toast.promise(
        (async () => {
          const token = await auth.currentUser.getIdToken();
          const res = await fetch("/api/billing/portal", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ intent }),
          });

          const text = await res.text();
          let data;
          try { data = JSON.parse(text); } catch { throw new Error(text); }
          if (!res.ok) throw new Error(data.error || "Failed to create portal session");

          // brief success toast then redirect
          setTimeout(() => { window.location.href = data.url; }, 300);
          return "Redirecting to Stripe…";
        })(),
        {
          loading: intent === "cancel" ? "Opening cancel options…" : "Opening billing portal…",
          success: (msg) => msg || "Redirecting…",
          error: (e) => e?.message || "Could not open customer portal.",
        }
      );
    } catch (e) {
      // toast already shown above
      console.error("openPortal error:", e);
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen grid place-items-center text-slate-600 dark:text-slate-300">
        <Toaster richColors position="top-right" closeButton />
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

      <Toaster richColors position="top-right" closeButton />

      {/* Same Navbar as Utility page */}
      <Navbar user={authUser} onSignOut={handleSignOut} />

      <main className="min-h-screen bg-gradient-to-b from-[#f7f8ff] to-white dark:from-slate-950 dark:to-slate-900">
        {/* spacer row kept (banner content previously commented) */}
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

          {/* Plan */}
          <aside className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm ring-1 ring-black/5 dark:ring-white/10 p-6">
            <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-4">Current Plan</h2>

            <div className="rounded-2xl border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-950/40 p-5 mb-5 relative">
              <div className="absolute right-3 top-3">
                <span
                  className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                    view.status === "active"
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                      : "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300"
                  }`}
                >
                  {view.status}
                </span>
              </div>
              <div className="text-slate-800 dark:text-slate-100 font-semibold">{view.plan}</div>
              <div className="mt-1">
                <span className="text-3xl font-extrabold text-slate-900 dark:text-white">
                  {view.amount !== "—" ? `$${view.amount}` : "—"}
                </span>
                {view.amount !== "—" && <span className="text-slate-600 dark:text-slate-300"> / mo</span>}
              </div>
              <div className="text-slate-600 dark:text-slate-300 text-sm mt-2">
                {view.renewDate ? `Renews on ${view.renewDate}` : "No renewal scheduled"}
              </div>
            </div>

            <div className="space-y-3">
              {/* Single Update button */}
              <button
                type="button"
                disabled={busy}
                onClick={() => openPortal("update")}
                className="w-full h-11 rounded-xl bg-[#6c2bd9] text-white font-medium shadow-sm hover:brightness-95 disabled:opacity-50 transition"
              >
                Update plan
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={() => openPortal("cancel")}
                className="w-full h-11 rounded-xl border border-amber-300 dark:border-amber-600 text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/30 font-medium hover:bg-amber-100 dark:hover:bg-amber-900/50 disabled:opacity-50 transition"
              >
                Cancel subscription
              </button>
            </div>
          </aside>
        </div>
      </main>
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
