// pages/index.js
import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { auth } from '@/lib/firebase/config';
import { onAuthStateChanged, signOut as fbSignOut } from 'firebase/auth';
import { getFirestore, doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore'; // keep for active-session guard

// Public envs (kept as in your file)
const PRICE_BASIC = process.env.NEXT_PUBLIC_STRIPE_PRICE_BASIC || 'price_basic_xxx';
const PRICE_PRO = process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO || 'price_pro_xxx';
const PRICE_ELITE = process.env.NEXT_PUBLIC_STRIPE_PRICE_ELITE || 'price_elite_xxx';

// stable per-browser session id
function getOrCreateSessionId() {
  try {
    let id = localStorage.getItem('pp_session_id');
    if (!id) {
      id = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : Math.random().toString(36).slice(2);
      localStorage.setItem('pp_session_id', id);
    }
    return id;
  } catch {
    return 'fallback-session';
  }
}

export default function LandingPage() {
  const router = useRouter();

  // Auth-aware header state
  const [user, setUser] = useState(null);
  const [open, setOpen] = useState(false);

  // anti-SSR-flash helper
  const [hydrated, setHydrated] = useState(false);

  // subscription state (now driven by Stripe)
  const [hasActivePlan, setHasActivePlan] = useState(false);
  const [planKnown, setPlanKnown] = useState(false); // first-read guard to avoid brief enable

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u || null));
    return () => unsub();
  }, []);

  // On return from checkout success, immediately cache "has plan" to prevent any flicker
  useEffect(() => {
    if (!router.isReady || !user?.uid) return;
    const q = router.query || {};
    if (q.payment === 'success') {
      try { localStorage.setItem(`pp_has_plan_${user.uid}`, '1'); } catch {}
      setHasActivePlan(true);
      setPlanKnown(true);
    }
  }, [router.isReady, router.query, user?.uid]);

  // 🔄 Read user's plan from STRIPE (not Firestore) + cache to prevent flash
  useEffect(() => {
    let cancelled = false;

    async function checkStripe() {
      // logged out → no plan
      if (!user?.uid) {
        setHasActivePlan(false);
        setPlanKnown(true);
        return;
      }

      // 1) Prime from cache so UI doesn't flash
      try {
        const cached = localStorage.getItem(`pp_has_plan_${user.uid}`);
        if (cached !== null) {
          if (!cancelled) {
            setHasActivePlan(cached === '1');
            setPlanKnown(true);
          }
        } else {
          if (!cancelled) setPlanKnown(false);
        }
      } catch {
        if (!cancelled) setPlanKnown(false);
      }

      // 2) Live fetch from server → /api/subscription-status
      try {
        const token = await auth.currentUser.getIdToken();
        const res = await fetch('/api/subscription-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        });
        const text = await res.text();
        let data;
        try { data = JSON.parse(text); } catch { data = {}; }

        const active = !!data?.active; // server applies active/trialing/past_due/unpaid
        if (!cancelled) {
          setHasActivePlan(active);
          setPlanKnown(true);
          try { localStorage.setItem(`pp_has_plan_${user.uid}`, active ? '1' : '0'); } catch {}
        }
      } catch (e) {
        // network/API failure → if we had no cache, default to disabled=false (no plan)
        if (!cancelled) {
          if (!planKnown) {
            setHasActivePlan(false);
            setPlanKnown(true);
          }
        }
      }
    }

    checkStripe();

    // re-check when tab becomes visible (user may upgrade in portal)
    const onVis = () => {
      if (document.visibilityState === 'visible') checkStripe();
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  // ---- Single-active-session guard (unchanged) ----
  useEffect(() => {
    if (!user?.uid) return;
    const db = getFirestore();
    const ref = doc(db, 'users', user.uid);
    const mySessionId = getOrCreateSessionId();

    // Claim (last-login wins)
    setDoc(ref, { activeSessionId: mySessionId, sessionUpdatedAt: serverTimestamp() }, { merge: true }).catch(() => {});

    // Watch for takeover by another device and sign out here if so
    const unsub = onSnapshot(ref, (snap) => {
      const data = snap.exists() ? snap.data() : {};
      const active = data?.activeSessionId;
      if (active && active !== mySessionId) {
        fbSignOut(auth).catch(() => {});
      }
    });
    return () => unsub();
  }, [user?.uid]);

  const initials = useMemo(() => {
    if (!user) return '';
    const name = user.displayName || user.email || '';
    const parts = name.replace(/@.*$/, '').split(/[.\s_-]+/).filter(Boolean);
    const a = parts[0]?.[0] || '';
    const b = parts[1]?.[0] || '';
    return (a + b).toUpperCase() || 'U';
  }, [user]);

  const handleLogout = async () => {
    try {
      await fbSignOut(auth);
      setOpen(false);
    } catch (e) {
      console.error('Sign out failed:', e);
    }
  };

  const handleChoose = async (priceId, e) => {
    const u = auth.currentUser;
    if (!u) return; // not signed in → let Link navigate to /signup?next=...

    e.preventDefault();
    e.stopPropagation();

    try {
      const idToken = await u.getIdToken();
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ priceId }),
      });
      const data = await res.json();
      if (data?.url) window.location.href = data.url;
      else alert(data?.error || 'Unable to start checkout.');
    } catch (err) {
      console.error(err);
      alert('Something went wrong starting checkout.');
    }
  };

  // Disable logic (unchanged):
  // - If user is logged in and plan is KNOWN → disable only when hasActivePlan
  // - If user is logged in and plan is NOT KNOWN YET (first paint) → keep disabled to avoid brief enable
  const shouldDisableForUser = (user && (!planKnown || hasActivePlan));

  // Prevent click & keyboard activation without changing styles
  const blockIfDisabled = (e) => {
    if (shouldDisableForUser) {
      e.preventDefault();
      e.stopPropagation();
      return true;
    }
    return false;
  };

  const blockKeyIfDisabled = (e) => {
    if (!shouldDisableForUser) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  // While not hydrated, hide pricing section to avoid SSR “enabled” flash for signed-in users
  // Also, if user is signed in but plan isn’t known yet, keep it hidden until we know.
  const hidePricing =
    !hydrated || (user && !planKnown);

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <Head>
        <title>PixelProof – AI-powered QA</title>
      </Head>

      {/* Header */}
      <header className="bg-purple-800 text-white px-6 py-4 flex justify-between items-center">
        <h1 className="text-2xl font-bold">PIXELPROOF</h1>

        {/* RIGHT SIDE: auth-aware */}
        <div className="flex items-center gap-3">
          {!user ? (
            <>
              <Link href="/login">
                <button className="text-white hover:underline">Sign in</button>
              </Link>
              <Link href="/signup">
                <button className="ml-2 border border-white text-white hover:bg-white hover:text-purple-800 px-4 py-1 rounded">
                  Sign up
                </button>
              </Link>
            </>
          ) : (
            <>
              <span className="hidden sm:inline">
                Signed in as <strong>{user.displayName || user.email}</strong>
              </span>
              <button
                onClick={() => setOpen(true)}
                className="relative inline-flex items-center justify-center h-9 w-9 rounded-full ring-1 ring-white/40 overflow-hidden focus:outline-none focus:ring-2 focus:ring-white/70 transition"
                aria-label="Open menu"
                title="Account"
              >
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt="Profile"
                    className="h-full w-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="h-full w-full grid place-items-center bg-white/20 text-white font-semibold">
                    {initials}
                  </div>
                )}
              </button>
            </>
          )}
        </div>
      </header>

      {/* Offcanvas Sidebar (only when signed in) */}
      {user && (
        <div
          className={`fixed inset-0 z-50 transition-opacity duration-300 ${
            open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
          aria-hidden={!open}
          onClick={() => setOpen(false)}
        >
          {/* Backdrop */}
          <div
            className={`absolute inset-0 bg-black/40 backdrop-blur-[1px] transition-opacity duration-300 ${
              open ? 'opacity-100' : 'opacity-0'
            }`}
          />
          {/* Panel */}
          <aside
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            className={`absolute right-0 top-0 h-full w-80 max-w-[90%] bg-white shadow-2xl border-l border-gray-200 transform transition-transform duration-300 ease-in-out ${
              open ? 'translate-x-0' : 'translate-x-full'
            }`}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-full overflow-hidden ring-1 ring-gray-200">
                  {user.photoURL ? (
                    <img
                      src={user.photoURL}
                      alt="Profile"
                      className="h-full w-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="h-full w-full grid place-items-center bg-gradient-to-br from-purple-600 to-fuchsia-600 text-white font-semibold">
                      {initials}
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {user.displayName || user.email}
                  </p>
                  <p className="text-xs text-gray-500 truncate">{user.email}</p>
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="p-2 rounded hover:bg-gray-100"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5 text-gray-700"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            </div>

            {/* Menu */}
            <nav className="px-2 py-3">
              <Link
                href="/utility"
                className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 text-gray-800"
                onClick={() => setOpen(false)}
              >
                <span className="inline-block h-2 w-2 rounded-full bg-fuchsia-600" />
                <span className="text-sm font-medium">Home</span>
              </Link>
              <Link
                href="/profile"
                className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 text-gray-800"
                onClick={() => setOpen(false)}
              >
                <span className="inline-block h-2 w-2 rounded-full bg-purple-600" />
                <span className="text-sm font-medium">Profile</span>
              </Link>
              <Link
                href="/accounts"
                className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 text-gray-800"
                onClick={() => setOpen(false)}
              >
                <span className="inline-block h-2 w-2 rounded-full bg-fuchsia-600" />
                <span className="text-sm font-medium">Accounts</span>
              </Link>
              <Link
                href="/aboutus"
                className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 text-gray-800"
                onClick={() => setOpen(false)}
              >
                <span className="inline-block h-2 w-2 rounded-full bg-fuchsia-600" />
                <span className="text-sm font-medium">About Us</span>
              </Link>
              <Link
                href="/contactus"
                className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 text-gray-800"
                onClick={() => setOpen(false)}
              >
                <span className="inline-block h-2 w-2 rounded-full bg-fuchsia-600" />
                <span className="text-sm font-medium">Contact Us</span>
              </Link>

              <button
                onClick={handleLogout}
                className="mt-2 w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 text-gray-800"
              >
                Logout
              </button>
            </nav>
          </aside>
        </div>
      )}

      {/* Hero Section */}
      <section className="bg-purple-800 text-white py-10 px-6 animate-fade-in">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between">
          <div className="md:w-1/2 mb-6 md:mb-0">
            <img
              src="/images/pixelproof-ai-assistant.png"
              alt="AI QA Assistant"
              className="w-full max-w-sm object-contain mx-auto md:mx-0"
            />
          </div>
          <div className="md:w-1/2 text-center md:text-left space-y-4 px-2">
            <h2 className="text-3xl md:text-4xl font-bold leading-snug">
              Eliminate UI Bugs <br className="hidden md:block" /> Before They Reach Production
            </h2>
            <p className="text-base md:text-lg text-purple-100">
              PixelProof automates your design-to-code validation process, ensuring consistent UI delivery —
              without manual QA bottlenecks.
            </p>
            <ul className="text-sm md:text-base space-y-1 list-disc list-inside text-purple-100">
              <li>Instant visual comparisons between design and final build</li>
              <li>Well Formatted AI-generated QA reports ready for stakeholder sharing</li>
              <li>No setup, no guessing — just accurate detection</li>
            </ul>

            {/* Show "Get Started" only when NOT logged in */}
            {!user && (
              <Link href="/login">
                <button className="mt-4 bg-white text-purple-800 font-bold py-2 px-6 rounded-full hover:bg-purple-100 transition">
                  Get Started
                </button>
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section
        className={`bg-white text-center py-16 px-6 transition-opacity duration-150 ${
          hidePricing ? 'opacity-0 pointer-events-none select-none' : 'opacity-100'
        }`}
      >
        <h2 className="text-3xl font-bold mb-8 text-purple-800">Pricing Plans</h2>
        <div className="grid gap-6 md:grid-cols-3 max-w-6xl mx-auto">
          {/* Starter */}
          <div className="border rounded-lg p-6 shadow hover:shadow-lg transition transform hover:scale-105">
            <h3 className="text-xl font-semibold text-purple-700 mb-2">Starter</h3>
            <p className="text-4xl font-bold text-purple-800 mb-2">$19.99</p>
            <p className="text-sm text-gray-600 mb-4">100 comparisons / month</p>
            <Link href={`/signup?next=/billing/checkout?plan=basic`}>
              <button
                className={`bg-purple-800 text-white w-full py-2 rounded ${shouldDisableForUser ? 'opacity-60 cursor-not-allowed' : ''}`}
                title={user && hasActivePlan ? 'You already have a plan' : undefined}
                aria-disabled={shouldDisableForUser ? 'true' : undefined}
                onClick={(e) => {
                  if (blockIfDisabled(e)) return;
                  if (auth.currentUser) {
                    e.preventDefault();
                    e.stopPropagation();
                    window.location.href = '/billing/checkout?plan=basic';
                  } else {
                    try { localStorage.setItem('postSignupNext', '/billing/checkout?plan=basic'); } catch {}
                  }
                }}
                onKeyDown={blockKeyIfDisabled}
              >
                Choose Starter
              </button>
            </Link>
          </div>

          {/* Pro */}
          <div className="border-2 border-purple-600 rounded-lg p-6 shadow-lg transform scale-105 bg-purple-50">
            <h3 className="text-xl font-semibold text-purple-700 mb-2">Pro</h3>
            <p className="text-4xl font-bold text-purple-800 mb-2">$49.99</p>
            <p className="text-sm text-gray-600 mb-4">500 comparisons / month</p>
            <Link href={`/signup?next=/billing/checkout?plan=pro`}>
              <button
                className={`bg-purple-800 text-white w-full py-2 rounded ${shouldDisableForUser ? 'opacity-60 cursor-not-allowed' : ''}`}
                title={user && hasActivePlan ? 'You already have a plan' : undefined}
                aria-disabled={shouldDisableForUser ? 'true' : undefined}
                onClick={(e) => {
                  if (blockIfDisabled(e)) return;
                  if (auth.currentUser) {
                    e.preventDefault();
                    e.stopPropagation();
                    window.location.href = '/billing/checkout?plan=pro';
                  } else {
                    try { localStorage.setItem('postSignupNext', '/billing/checkout?plan=pro'); } catch {}
                  }
                }}
                onKeyDown={blockKeyIfDisabled}
              >
                Choose Pro
              </button>
            </Link>
          </div>

          {/* Unlimited */}
          <div className="border rounded-lg p-6 shadow hover:shadow-lg transition transform hover:scale-105">
            <h3 className="text-xl font-semibold text-purple-700 mb-2">Unlimited</h3>
            <p className="text-4xl font-bold text-purple-800 mb-2">$99.99</p>
            <p className="text-sm text-gray-600 mb-4">Unlimited comparisons</p>
            <Link href={`/signup?next=/billing/checkout?plan=elite`}>
              <button
                className={`bg-purple-800 text-white w-full py-2 rounded ${shouldDisableForUser ? 'opacity-60 cursor-not-allowed' : ''}`}
                title={user && hasActivePlan ? 'You already have a plan' : undefined}
                aria-disabled={shouldDisableForUser ? 'true' : undefined}
                onClick={(e) => {
                  if (blockIfDisabled(e)) return;
                  if (auth.currentUser) {
                    e.preventDefault();
                    e.stopPropagation();
                    window.location.href = '/billing/checkout?plan=elite';
                  } else {
                    try { localStorage.setItem('postSignupNext', '/billing/checkout?plan=elite'); } catch {}
                  }
                }}
                onKeyDown={blockKeyIfDisabled}
              >
                Choose Unlimited
              </button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="text-center py-6 text-gray-500 text-sm">
        PixelProof © 2025 | Privacy Policy | Terms of Service
      </footer>

      {/* Animation Style */}
      <style jsx global>{`
        .animate-fade-in { animation: fadeIn 1.2s ease-out; }
        @keyframes fadeIn {
          0% { opacity: 0; transform: translateY(20px); }
          100% { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
