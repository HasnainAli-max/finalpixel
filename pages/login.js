import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged } from "firebase/auth";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { app } from "../lib/firebase/config";
import Head from "next/head";
import SignIn from "@/components/customLogin";

export default function Login() {
  const auth = getAuth(app);
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [loading, setLoading] = useState(false);

  // Helper to read the ?next=... param safely
  const getNextDest = () => {
    const q = router.query?.next;
    return Array.isArray(q) ? q[0] : q || "/utility";
  };

  useEffect(() => {
    if (!router.isReady) return; // ensure query is available
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        // If already logged in, go where the flow wants (Stripe checkout) or default
        router.replace(getNextDest());
      } else {
        setCheckingAuth(false);
      }
    });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady]);

  const handleGoogleSignIn = async () => {
    const provider = new GoogleAuthProvider();
    try {
      setLoading(true);
      await signInWithPopup(auth, provider);
      // After successful sign-in, respect the next param
      router.replace(getNextDest());
    } catch (error) {
      console.error("Google Sign-In Error:", error);
      alert("Google Sign-In failed. " + error.message);
      setLoading(false);
    }
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-blue-50 text-blue-700 text-lg font-semibold">
        Checking authentication...
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Login – PixelProof</title>
      </Head>

      <div className="min-h-screen flex items-center justify-center bg-blue-50 px-4">
        <div className="bg-white p-8 rounded-xl shadow-md max-w-sm w-full text-center">
          <h1 className="text-2xl font-semibold text-blue-700 mb-4">PixelProof</h1>
          <p className="text-sm text-gray-600 mb-6">
            Your AI-powered Design QA Assistant
          </p>

          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={loading}
            aria-label="Sign in with Google"
            className={`flex w-full items-center h-11 rounded-md shadow-sm overflow-hidden
              bg-[#4285F4] text-white transition
              focus:outline-none focus:ring-2 focus:ring-[#4285F4]/50
              ${loading ? 'opacity-60 cursor-not-allowed' : 'hover:bg-[#357AE8]'}`}
          >
            {/* Left white segment with Google logo */}
            <span className="flex h-full items-center justify-center bg-gray-50 px-3 border-r border-black/10">
              <svg className="h-5 w-5" viewBox="0 0 533.5 544.3" aria-hidden="true">
                <path fill="#4285F4" d="M533.5 278.4c0-17.4-1.6-34.1-4.6-50.2H272v95h146.9c-6.3 34.1-25.1 62.9-53.8 82.3l87.1 67c50.9-46.9 80.3-116 80.3-194.1z" />
                <path fill="#34A853" d="M272 544.3c72.9 0 134.1-24.1 178.8-65.6l-87.1-67c-24.2 16.3-55.1 26-91.7 26-70.6 0-130.5-47.7-152-111.9l-90.4 70.1c38.8 77 119 148.4 242.4 148.4z" />
                <path fill="#FBBC05" d="M120 325.8c-10.5-31.5-10.5-65.5 0-97l-90.4-70.1c-37.9 75.6-37.9 161.6 0 237.2l90.4-70.1z" />
                <path fill="#EA4335" d="M272 107.7c39.6-.6 77.3 14 106.2 41.6l79.5-79.5C413.6 26.3 353.2 0 272 0 148.6 0 68.4 71.4 29.6 148.7l90.4 70.1C142.5 154.6 201.4 107.7 272 107.7z" />
              </svg>
            </span>

            {/* Centered label */}
            <span className="flex-1 text-center font-medium select-none">
              {loading ? "Signing in..." : "Sign in with Google"}
            </span>
          </button>

          {/* Your existing custom sign-in component (email/password etc.) */}
          <SignIn />
        </div>
      </div>
    </>
  );
}
