// pages/ChangePassword.js  (Pages Router)
// or app/ChangePassword/page.jsx (App Router)
"use client";

import React, { useState } from "react";
import { Toaster, toast } from "sonner";
import { changePassword, auth } from "@/lib/firebase/config";

const ChangePassword = () => {
  // --- unchanged logic ---
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [loading, setLoading] = useState(false);
  const [show, setShow] = useState({ curr: false, new: false, conf: false });

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!auth.currentUser) {
      toast.error("You’re not signed in. Please sign in again.");
      return;
    }
    if (!currentPw) return toast.error("Enter your current password.");
    if (!newPw) return toast.error("Enter a new password.");
    if (newPw.length < 6) return toast.error("New password must be at least 6 characters.");
    if (newPw !== confirmPw) return toast.error("New passwords do not match.");
    if (currentPw === newPw) return toast.error("New password must be different from current password.");

    try {
      setLoading(true);
      await toast.promise(
        changePassword(currentPw, newPw),
        {
          loading: "Updating password...",
          success: "Password updated successfully.",
          error: (e) => {
            switch (e?.code) {
              case "auth/wrong-password": return "Current password is incorrect.";
              case "auth/invalid-credential": return "Reauthentication failed. Try again.";
              case "auth/too-many-requests": return "Too many attempts. Try later.";
              case "auth/weak-password": return "New password is too weak.";
              case "auth/requires-recent-login": return "Please sign in again and retry.";
              default: return e?.message || "Failed to update password.";
            }
          },
        }
      );
      setCurrentPw("");
      setNewPw("");
      setConfirmPw("");
    } finally {
      setLoading(false);
    }
  };
  // --- end unchanged logic ---

  return (
    <>
      <Toaster richColors position="top-right" closeButton />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* main card: no border */}
        <div className="rounded-3xl bg-white dark:bg-gray-900 shadow-sm">
          {/* Header */}
          <div className="px-6 sm:px-8 pt-6 sm:pt-8 pb-4">
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Change Password</h1>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              Enter your current password and choose a new one.
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="px-6 sm:px-8 py-6 sm:py-8">
            {/* Current password */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Current password
              </label>
              <div className="relative">
                <input
                  type={show.curr ? "text" : "password"}
                  value={currentPw}
                  onChange={(e) => setCurrentPw(e.target.value)}
                  className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800
                             px-4 py-3 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500
                             focus:outline-none focus:ring-2 focus:ring-purple-600 focus:border-purple-600 pr-12"
                  placeholder="Enter current password"
                  autoComplete="current-password"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => ({ ...s, curr: !s.curr }))}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800"
                  aria-label="Toggle visibility"
                >
                  <svg className="h-5 w-5 text-gray-500" viewBox="0 0 24 24" fill="none">
                    <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" stroke="currentColor" strokeWidth="1.5"/>
                    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5"/>
                  </svg>
                </button>
              </div>
            </div>

            {/* New password */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                New password
              </label>
              <div className="relative">
                <input
                  type={show.new ? "text" : "password"}
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                  className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800
                             px-4 py-3 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500
                             focus:outline-none focus:ring-2 focus:ring-purple-600 focus:border-purple-600 pr-12"
                  placeholder="Enter new password"
                  autoComplete="new-password"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => ({ ...s, new: !s.new }))}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800"
                  aria-label="Toggle visibility"
                >
                  <svg className="h-5 w-5 text-gray-500" viewBox="0 0 24 24" fill="none">
                    <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" stroke="currentColor" strokeWidth="1.5"/>
                    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5"/>
                  </svg>
                </button>
              </div>
            </div>

            {/* Confirm new password */}
            <div className="mb-8">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Confirm new password
              </label>
              <div className="relative">
                <input
                  type={show.conf ? "text" : "password"}
                  value={confirmPw}
                  onChange={(e) => setConfirmPw(e.target.value)}
                  className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800
                             px-4 py-3 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500
                             focus:outline-none focus:ring-2 focus:ring-purple-600 focus:border-purple-600 pr-12"
                  placeholder="Re-enter new password"
                  autoComplete="new-password"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => ({ ...s, conf: !s.conf }))}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800"
                  aria-label="Toggle visibility"
                >
                  <svg className="h-5 w-5 text-gray-500" viewBox="0 0 24 24" fill="none">
                    <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" stroke="currentColor" strokeWidth="1.5"/>
                    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5"/>
                  </svg>
                </button>
              </div>
            </div>

            {/* Submit */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className={`w-full rounded-xl text-white py-3 text-sm font-medium transition ${
                  loading
                    ? "bg-purple-400 cursor-not-allowed"
                    : "bg-purple-600 hover:bg-purple-700"
                }`}
              >
                {loading ? "Updating..." : "Update password"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
};

export default ChangePassword;
