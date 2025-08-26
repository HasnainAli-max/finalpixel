// // pages/billing/checkout.js
// import { useEffect, useRef, useState } from 'react';
// import { useRouter } from 'next/router';
// import { auth } from '@/lib/firebase/config'; // your client Firebase

// export default function CheckoutRunner() {
//   const router = useRouter();
//   const [msg, setMsg] = useState('Preparing checkout…');
//   const launched = useRef(false);

//   useEffect(() => {
//     if (!router.isReady) return;

//     const raw = router.query.plan;       // 'basic' | 'pro' | 'elite'
//     const plan = Array.isArray(raw) ? raw[0] : raw;

//     if (!plan) {
//       setMsg('Missing plan. Please go back and choose a plan.');
//       return;
//     }
//     if (launched.current) return;
//     launched.current = true;

//     (async () => {
//       const user = auth.currentUser;
//       if (!user) {
//         router.replace(`/login?next=/billing/checkout?plan=${encodeURIComponent(plan)}`);
//         return;
//       }
//       try {
//         const idToken = await user.getIdToken();
//         const res = await fetch('/api/checkout', {
//           method: 'POST',
//           headers: {
//             'Content-Type': 'application/json',
//             Authorization: `Bearer ${idToken}`,
//           },
//           body: JSON.stringify({ plan }), // ✅ send plan slug
//         });
//         const data = await res.json().catch(() => ({}));
//         if (res.ok && data?.url) {
//           window.location.href = data.url; // Stripe Checkout
//         } else {
//           console.error('Checkout error:', res.status, data);
//           setMsg(data?.error || 'Could not create checkout session. Please try again.');
//         }
//       } catch (e) {
//         console.error(e);
//         setMsg('Network error. Please try again.');
//       }
//     })();
//   }, [router.isReady, router.query.plan]);

//   return (
//     <div style={{ padding: 24 }}>
//       <h1>{msg}</h1>
//       <p>If this takes more than a few seconds, go back to Pricing and pick a plan again.</p>
//     </div>
//   );
// }










import Head from 'next/head';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { auth } from '@/lib/firebase/config';

export default function CheckoutRunner() {
  const router = useRouter();
  const [msg, setMsg] = useState('Preparing checkout…');
  const [submitting, setSubmitting] = useState(false);
  const launched = useRef(false);

  useEffect(() => {
    if (!router.isReady) return;

    // normalize plan from query
    const raw = router.query.plan;          // 'basic' | 'pro' | 'elite'
    const plan = Array.isArray(raw) ? raw[0] : raw;

    if (!plan) {
      setMsg('Missing plan. Please go back and choose a plan.');
      return;
    }
    if (launched.current) return;
    launched.current = true;

    (async () => {
      const user = auth.currentUser;
      if (!user) {
        // ✅ encode the whole next URL so the query string stays intact
        const next = `/billing/checkout?plan=${encodeURIComponent(plan)}`;
        router.replace(`/login?next=${encodeURIComponent(next)}`);
        return;
      }

      try {
        setSubmitting(true);
        const idToken = await user.getIdToken();

        const res = await fetch('/api/checkout', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({ plan }), // send the plan slug
        });

        // Handle cases where server returns HTML error pages
        const text = await res.text();
        let data;
        try { data = JSON.parse(text); } catch { throw new Error(text); }

        if (res.ok && data?.url) {
          window.location.href = data.url; // Stripe Checkout
        } else {
          throw new Error(data?.error || 'Could not create checkout session. Please try again.');
        }
      } catch (e) {
        console.error('Checkout error:', e);
        setMsg(e.message || 'Network error. Please try again.');
        setSubmitting(false);
      }
    })();
  }, [router.isReady, router.query.plan, router]);

  return (
    <>
      <Head><title>Checkout – PixelProof</title></Head>
      <main className="min-h-screen grid place-items-center bg-gradient-to-b from-[#f7f8ff] to-white dark:from-slate-950 dark:to-slate-900 text-slate-700 dark:text-slate-300 p-6">
        <div className="max-w-md w-full rounded-2xl p-6 ring-1 ring-black/5 dark:ring-white/10 bg-white dark:bg-slate-800">
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">Checkout</h1>
          <p className="text-sm mb-6">{msg}</p>

          <button
            onClick={() => { launched.current = false; router.replace(router.asPath); }}
            disabled={submitting}
            className="w-full h-11 rounded-xl bg-[#6c2bd9] text-white font-medium hover:brightness-95 disabled:opacity-60 transition"
          >
            Retry
          </button>

          <button
            onClick={() => router.push('/plans')}
            className="mt-3 w-full h-11 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 bg-transparent hover:bg-slate-50 dark:hover:bg-slate-700/40 transition"
          >
            Back to Plans
          </button>
        </div>
      </main>
    </>
  );
}
