"use client";

import Link from "next/link";
import React, { useEffect, useMemo, useState } from "react";
import { auth, db } from "@/lib/firebase/config";
import { onAuthStateChanged, signOut as fbSignOut } from "firebase/auth";
import { doc, onSnapshot, setDoc, serverTimestamp } from "firebase/firestore"; // + setDoc, serverTimestamp

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

export default function Navbar({ user: userProp, onSignOut }) {
  const [open, setOpen] = useState(false);
  const [selfUser, setSelfUser] = useState(null);
  const [profileDoc, setProfileDoc] = useState(null); // Firestore user doc

  // If no user prop is provided, listen to Firebase Auth as a fallback
  useEffect(() => {
    let unsubAuth;
    if (!userProp) {
      unsubAuth = onAuthStateChanged(auth, (u) => setSelfUser(u || null));
    } else {
      setSelfUser(userProp);
    }
    return () => unsubAuth && unsubAuth();
  }, [userProp]);

  const user = userProp || selfUser;

  // Live-subscribe to Firestore user doc (to read photoURL saved there)
  useEffect(() => {
    if (!user?.uid) {
      setProfileDoc(null);
      return;
    }
    const ref = doc(db, "users", user.uid);
    const unsub = onSnapshot(
      ref,
      (snap) => setProfileDoc(snap.exists() ? snap.data() : null),
      () => setProfileDoc(null)
    );
    return () => unsub();
  }, [user?.uid]);

  // ---- Single-active-session guard (centralized too) ----
  useEffect(() => {
    if (!user?.uid) return;

    const ref = doc(db, "users", user.uid);
    const mySessionId = getOrCreateSessionId();

    // Claim (last-login wins)
    setDoc(ref, { activeSessionId: mySessionId, sessionUpdatedAt: serverTimestamp() }, { merge: true }).catch(() => {});

    // If another device claims, sign out here
    const unsub = onSnapshot(ref, (snap) => {
      const data = snap.exists() ? snap.data() : {};
      const active = data?.activeSessionId;
      if (active && active !== mySessionId) {
        if (onSignOut) {
          onSignOut().catch(() => {});
        } else {
          fbSignOut(auth).catch(() => {});
        }
      }
    });
    return () => unsub();
  }, [user?.uid, onSignOut]);

  // Close offcanvas on Esc
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Initials fallback for avatar
  const initials = useMemo(() => {
    if (!user) return "";
    const name = user.displayName || user.email || "";
    const parts = name.replace(/@.*$/, "").split(/[.\s_-]+/).filter(Boolean);
    const first = parts[0]?.[0] || "";
    const second = parts[1]?.[0] || "";
    return (first + second).toUpperCase();
  }, [user]);

  /**
   * Decide which photo to show:
   * 1) Prefer Firestore users/{uid}.photoURL (image you saved for the user)
   * 2) Fallback to Firebase Auth user.photoURL
   */
  const photoURLToShow = useMemo(() => {
    const fromFirestore =
      profileDoc?.photoURL ||
      profileDoc?.avatarURL ||
      profileDoc?.avatarUrl ||
      profileDoc?.avatar?.url ||
      null;

    return fromFirestore || user?.photoURL || null;
  }, [profileDoc, user]);

  const handleLogout = async () => {
    try {
      if (onSignOut) {
        await onSignOut();
      } else {
        await fbSignOut(auth);
      }
    } catch (e) {
      console.error("Sign out failed:", e);
    }
  };

  // ✅ NEW: open Stripe Customer Portal (no other logic touched)
  const handleOpenPortal = async () => {
    try {
      const u = auth.currentUser;
      if (!u) {
        // If somehow not authenticated, just bounce to plans page
        window.location.href = "/";
        return;
      }
      const idToken = await u.getIdToken();
      const res = await fetch("/api/portal", {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.url) {
        window.location.href = data.url;
      } else {
        // fallback: go to plans page
        window.location.href = "/";
      }
    } catch {
      window.location.href = "/";
    }
  };

  return (
    <header className="w-full border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
        {/* Brand (unchanged) */}
        <div className="flex items-center space-x-2">
          <Link href="/utility" className=" cursor-pointer">
          <img src="/logo.svg" alt="Logo" className="h-6 w-6" />
          </Link>
          <span className="text-lg font-bold text-purple-800 dark:text-purple-300">PixelProof</span>
        </div>

        {/* Right Section */}
        <div className="flex items-center space-x-4 text-sm">
          {user && (
            <>
              <span className="text-gray-600 dark:text-gray-300 hidden sm:inline">
                Signed in as <strong>{user.displayName || user.email}</strong>
              </span>

              {/* Avatar button (opens sidebar) */}
              <button
                onClick={() => setOpen(true)}
                className="relative inline-flex items-center justify-center h-9 w-9 rounded-full ring-1 ring-gray-200 dark:ring-gray-700 overflow-hidden focus:outline-none focus:ring-2 focus:ring-purple-500 transition"
                aria-label="Open menu"
              >
                {photoURLToShow ? (
                  <img
                    src={photoURLToShow}
                    alt="Profile"
                    className="h-full w-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="h-full w-full grid place-items-center bg-gradient-to-br from-purple-600 to-fuchsia-600 text-white font-semibold">
                    {initials || "U"}
                  </div>
                )}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Offcanvas Sidebar */}
      {user && (
        <div
          className={`fixed inset-0 z-50 transition-opacity duration-300 ${
            open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
          }`}
          aria-hidden={!open}
          onClick={() => setOpen(false)}
        >
          {/* Backdrop */}
          <div
            className={`absolute inset-0 bg-black/40 backdrop-blur-[1px] transition-opacity duration-300 ${
              open ? "opacity-100" : "opacity-0"
            }`}
          />

          {/* Panel */}
          <aside
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            className={`absolute right-0 top-0 h-full w-80 max-w-[90%] bg-white dark:bg-gray-900 shadow-2xl border-l border-gray-200 dark:border-gray-800 transform transition-transform duration-300 ease-in-out ${
              open ? "translate-x-0" : "translate-x-full"
            }`}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800">
              <div className="flex items-center gap-3">
                {photoURLToShow ? (
                  <img
                    src={photoURLToShow}
                    alt="Profile"
                    className="h-9 w-9 rounded-full object-cover ring-1 ring-gray-200 dark:ring-gray-700"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="h-9 w-9 rounded-full grid place-items-center bg-gradient-to-br from-purple-600 to-fuchsia-600 text-white font-semibold ring-1 ring-gray-200 dark:ring-gray-700">
                    {initials || "U"}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                    {user.displayName || user.email}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{user.email}</p>
                </div>
              </div>

              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5 text-gray-700 dark:text-gray-300"
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
                className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-800 dark:text-gray-200"
                onClick={() => setOpen(false)}
              >
                <span className="inline-block h-2 w-2 rounded-full bg-fuchsia-600" />
                <span className="text-sm font-medium">Home</span>
              </Link>

              <Link
                href="/profile"
                className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-800 dark:text-gray-200"
                onClick={() => setOpen(false)}
              >
                <span className="inline-block h-2 w-2 rounded-full bg-purple-600" />
                <span className="text-sm font-medium">Profile</span>
              </Link>

              <Link
                href="/accounts"
                className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-800 dark:text-gray-200"
                onClick={() => setOpen(false)}
              >
                <span className="inline-block h-2 w-2 rounded-full bg-fuchsia-600" />
                <span className="text-sm font-medium">Accounts</span>
              </Link>

              <Link
                href="/aboutus"
                className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-800 dark:text-gray-200"
                onClick={() => setOpen(false)}
              >
                <span className="inline-block h-2 w-2 rounded-full bg-fuchsia-600" />
                <span className="text-sm font-medium">About Us</span>
              </Link>

              <Link
                href="/contactus"
                className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-800 dark:text-gray-200"
                onClick={() => setOpen(false)}
              >
                <span className="inline-block h-2 w-2 rounded-full bg-fuchsia-600" />
                <span className="text-sm font-medium">Contact Us</span>
              </Link>

              <Link
                href="/"
                className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-800 dark:text-gray-200"
                onClick={() => setOpen(false)}
              >
                <span className="inline-block h-2 w-2 rounded-full bg-fuchsia-600" />
                <span className="text-sm font-medium">Plans</span>
              </Link>

              {/* ✅ NEW: Update Plan (Customer Portal) */}
              <button
                onClick={async () => {
                  setOpen(false);
                  await handleOpenPortal();
                }}
                className="mt-2 w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-800 dark:text-gray-200"
              >
                Update Plan
              </button>

              <button
                onClick={async () => {
                  setOpen(false);
                  await handleLogout();
                }}
                className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-800 dark:text-gray-200"
              >
                Logout
              </button>
            </nav>
          </aside>
        </div>
      )}
    </header>
  );
}
