// pages/billing/success.js
"use client";

import Head from "next/head";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { auth } from "@/lib/firebase/config";
import { Toaster, toast } from "sonner";

export default function SuccessPage() {
  const router = useRouter();
  const { session_id } = router.query;

  const [userReady, setUserReady] = useState(false);

  useEffect(() => {
    // Ensure auth is initialized before allowing actions
    const unsub = auth.onAuthStateChanged(() => setUserReady(true));
    return () => unsub();
  }, []);

  useEffect(() => {
    // Optional: ping your status endpoint to sync Firestore after success
    (async () => {
      try {
        if (!userReady || !auth.currentUser) return;
        const token = await auth.currentUser.getIdToken();
        await fetch("/api/subscription/status", {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
        });
        // Friendly toast
        toast.success("Payment completed! Your subscription is active.");
      } catch {
        // Non-blocking
      }
    })();
  }, [userReady]);

  return (
    <>
      <Head>
        <title>Payment Successful • PixelProof</title>
      </Head>

      <Toaster richColors position="top-center" closeButton />

      <main className="min-h-[70vh] grid place-items-center bg-gradient-to-b from-purple-50 to-white dark:from-slate-950 dark:to-slate-900">
        <div className="w-full max-w-md mx-auto">
          <div className="relative overflow-hidden rounded-2xl bg-white dark:bg-slate-900 border border-purple-100 dark:border-slate-800 shadow-lg p-6 md:p-8 text-center">
            {/* Success badge */}
            <div className="mx-auto h-16 w-16 rounded-full grid place-items-center bg-emerald-100 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 mb-4">
              <svg viewBox="0 0 24 24" className="h-8 w-8 text-emerald-600 dark:text-emerald-300" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </div>

            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              Payment successful!
            </h1>
            <p className="mt-2 text-slate-600 dark:text-slate-300">
              Thank you for subscribing to PixelProof. Your account has been upgraded.
            </p>

            {/* Optional info row */}
            {session_id ? (
              <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                Ref: <span className="font-mono">{session_id}</span>
              </p>
            ) : null}

            {/* Actions */}
            <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
              <Link href="/utility" className="inline-flex justify-center items-center rounded-xl bg-purple-700 text-white px-5 h-11 font-medium hover:brightness-110">
                Go to Home
              </Link>
              <Link href="/accounts" className="inline-flex justify-center items-center rounded-xl border border-slate-300 dark:border-slate-700 px-5 h-11 font-medium hover:bg-slate-50 dark:hover:bg-slate-800">
                View Account
              </Link>
            </div>

            {/* Back home */}
            {/* <div className="mt-4">
              <Link href="/" className="text-sm text-purple-700 dark:text-purple-300 hover:underline">
                Return to homepage
              </Link>
            </div> */}
          </div>
        </div>
      </main>
    </>
  );
}
