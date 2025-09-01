// components/SignIn.js
"use client";

import Link from "next/link";
import { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase/config";
import { Toaster, toast } from "sonner";

const SignIn = () => {
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading]   = useState(false);

  const validate = () => {
    if (!email.trim()) return "Email is required.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Enter a valid email.";
    if (!password) return "Password is required.";
    return null;
  };

  const handleSignIn = async () => {
    const err = validate();
    if (err) { toast.error(err); return; }

    try {
      setLoading(true);
      const cred = await toast.promise(
        signInWithEmailAndPassword(auth, email, password),
        {
          loading: "Signing in...",
          success: "Welcome back!",
          error: (e) => e?.message || "Sign in failed",
        }
      );
      const token = await cred.user.getIdToken();
      if (typeof window !== "undefined") localStorage.setItem("token", token);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Toaster richColors position="top-right" closeButton />

      <div
        className="
          flex w-full flex-col items-center justify-center
          bg-white text-gray-900
          pt-5 px-5
          rounded-2xl max-w-sm text-center gap-4
          shadow-sm 
        "
      >
        <input
          placeholder="Email"
          className="
            w-full border border-gray-300 rounded-md px-4 py-2
            bg-gray-50 text-gray-900
            placeholder-gray-400
            focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent
          "
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={loading}
          autoComplete="email"
          inputMode="email"
        />
        <input
          type="password"
          placeholder="Password"
          className="
            w-full border border-gray-300 rounded-md px-4 py-2
            bg-gray-50 text-gray-900
            placeholder-gray-400
            focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent
          "
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={loading}
          autoComplete="current-password"
        />

        <button
          className={`
            w-full py-2 rounded-md transition
            bg-blue-600 text-white
            focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2
            ${loading ? "opacity-60 cursor-not-allowed" : "hover:bg-blue-700"}
          `}
          onClick={handleSignIn}
          disabled={loading}
        >
          {loading ? "Signing in..." : "Sign In"}
        </button>

        <Link
          href="/reset"
          className="text-sm text-blue-600 hover:underline underline-offset-2"
        >
          Forgot password?
        </Link>

        <div className="w-full pb-4">
          <p className="flex text-sm items-center justify-center text-gray-700">
            Don&apos;t have an account?
            <Link
              className="text-blue-600 hover:text-blue-700 hover:underline cursor-pointer ml-1"
              href="/signup"
            >
              Sign Up
            </Link>
          </p>
        </div>
      </div>
    </>
  );
};

export default SignIn;
