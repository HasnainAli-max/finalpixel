// pages/reset.js (Pages Router) or app/reset/page.jsx (App Router)
"use client";

import React from "react";
import { getAuth, sendPasswordResetEmail } from "firebase/auth";
// Adjust this import if your config exports a different name
import { firebaseApp } from "@/lib/firebase/config";

export const auth = getAuth(firebaseApp);

// ✅ Your original logic (unchanged)
const reset = async (e) => {
  e.preventDefault();
  const email = e.target.email.value; // Get email from form input

  try {
    await sendPasswordResetEmail(auth, email);
    alert("Password reset email sent! Check your inbox.");
  } catch (error) {
    console.error("Error sending password reset email:", error.message);
    alert(`Error: ${error.message}`);
  }
};

// Renamed component to avoid name conflict with the reset() handler above
function ResetPage() {
  return (
    <div className="min-h-[60vh] w-full flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4">
      <form
        onSubmit={reset}
        className="w-full max-w-md rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow p-6"
      >
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
          Reset your password
        </h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Enter your account email and we&apos;ll send you a reset link.
        </p>

        <label
          htmlFor="email"
          className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
        >
          Email
        </label>
        <input
          id="email"
          name="email"             // <-- required for e.target.email.value
          type="email"
          placeholder="you@example.com"
          required
          className="w-full mb-4 border border-gray-300 dark:border-gray-700 rounded-md px-4 py-2
                     bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100
                     placeholder-gray-400 dark:placeholder-gray-500
                     focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
        />

        <button
          type="submit"
          className="w-full rounded-md text-white py-2 bg-blue-600 hover:bg-blue-700"
        >
          Send reset email
        </button>

        <div className="mt-4 text-sm text-gray-600 dark:text-gray-400 text-center">
          Remembered your password?{" "}
          <a href="/login" className="text-blue-600 hover:underline">
            Back to sign in
          </a>
        </div>
      </form>
    </div>
  );
}

export default ResetPage;

















    // // pages/reset.js
// "use client";

// import { useEffect, useState } from "react";
// import { useRouter } from "next/router"; // For Pages Router
// import Link from "next/link";
// import {
//   sendPasswordResetEmail,
//   verifyPasswordResetCode,
//   confirmPasswordReset,
// } from "firebase/auth";
// import { auth } from "@/lib/firebase/config";
// import { Toaster, toast } from "sonner";

// export default function Reset() {
//   const router = useRouter();

//   // Stage: "request" (send email) | "set" (set new password)
//   const [stage, setStage] = useState("request");
//   const [verifying, setVerifying] = useState(false);

//   // Request stage
//   const [email, setEmail] = useState("");
//   const [sending, setSending] = useState(false);

//   // Set stage
//   const [oobCode, setOobCode] = useState("");
//   const [accountEmail, setAccountEmail] = useState(""); // email tied to oobCode
//   const [newPw, setNewPw] = useState("");
//   const [newPw2, setNewPw2] = useState("");
//   const [updating, setUpdating] = useState(false);
//   const [showPw, setShowPw] = useState(false);
//   const [showPw2, setShowPw2] = useState(false);

//   // Detect oobCode in URL and verify
//   useEffect(() => {
//     if (!router.isReady) return;
//     const { oobCode: code, mode } = router.query;

//     if (mode === "resetPassword" && typeof code === "string" && code) {
//       setStage("set");
//       setVerifying(true);
//       setOobCode(code);

//       verifyPasswordResetCode(auth, code)
//         .then((mail) => {
//           setAccountEmail(mail || "");
//         })
//         .catch((e) => {
//           toast.error(
//             e?.code === "auth/expired-action-code"
//               ? "This reset link has expired. Please request a new one."
//               : "Invalid reset link. Please request a new one."
//           );
//           setStage("request");
//         })
//         .finally(() => setVerifying(false));
//     } else {
//       setStage("request");
//     }
//   }, [router.isReady, router.query]);

//   // Send reset email
//   const handleSend = async () => {
//     const em = email.trim();
//     if (!em) return toast.error("Enter your email.");
//     if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) return toast.error("Enter a valid email.");

//     try {
//       setSending(true);
//       auth?.useDeviceLanguage?.();

//       const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
//       const actionCodeSettings = {
//         url: `${baseUrl}/reset`, // comes back here
//         handleCodeInApp: true,   // ensures the link redirects to this page with oobCode
//       };

//       await toast.promise(
//         sendPasswordResetEmail(auth, em, actionCodeSettings),
//         {
//           loading: "Sending reset email...",
//           success: "Password reset email sent. Check your inbox.",
//           error: (e) => {
//             switch (e?.code) {
//               case "auth/user-not-found": return "No account found for this email.";
//               case "auth/invalid-email": return "Invalid email address.";
//               case "auth/unauthorized-continue-uri": return "Domain not authorized in Firebase Auth settings.";
//               case "auth/too-many-requests": return "Too many attempts. Try again later.";
//               default: return e?.message || "Failed to send reset email.";
//             }
//           },
//         }
//       );
//     } finally {
//       setSending(false);
//     }
//   };

//   // Confirm new password
//   const handleConfirm = async () => {
//     if (!newPw) return toast.error("Enter a new password.");
//     if (newPw.length < 6) return toast.error("Password must be at least 6 characters.");
//     if (newPw !== newPw2) return toast.error("Passwords do not match.");

//     try {
//       setUpdating(true);
//       await toast.promise(
//         confirmPasswordReset(auth, oobCode, newPw),
//         {
//           loading: "Updating password...",
//           success: "Password updated. You can sign in now.",
//           error: (e) => {
//             switch (e?.code) {
//               case "auth/expired-action-code": return "This link has expired. Request a new reset email.";
//               case "auth/invalid-action-code": return "Invalid link. Request a new reset email.";
//               case "auth/weak-password": return "Password is too weak.";
//               default: return e?.message || "Failed to update password.";
//             }
//           },
//         }
//       );
//       router.push("/signin");
//     } finally {
//       setUpdating(false);
//     }
//   };

//   return (
//     <>
//       <Toaster richColors position="top-right" closeButton />

//       <div className="min-h-[60vh] w-full flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4">
//         <div className="w-full max-w-md rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow p-6">
//           {stage === "request" && (
//             <>
//               <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
//                 Reset your password
//               </h1>
//               <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
//                 Enter your account email and we&apos;ll send you a reset link.
//               </p>

//               <input
//                 placeholder="Email"
//                 className="w-full mb-3 border border-gray-300 dark:border-gray-700 rounded-md px-4 py-2
//                            bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100
//                            placeholder-gray-400 dark:placeholder-gray-500
//                            focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
//                 value={email}
//                 onChange={(e) => setEmail(e.target.value)}
//                 disabled={sending}
//                 autoComplete="email"
//                 inputMode="email"
//               />

//               <button
//                 onClick={handleSend}
//                 disabled={sending}
//                 className={`w-full rounded-md text-white py-2 ${
//                   sending ? "bg-blue-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700"
//                 }`}
//               >
//                 {sending ? "Sending..." : "Send reset link"}
//               </button>

//               <div className="mt-4 text-sm text-gray-600 dark:text-gray-400">
//                 Remembered your password?{" "}
//                 <Link className="text-blue-600 hover:underline" href="/signin">
//                   Sign in
//                 </Link>
//               </div>
//             </>
//           )}

//           {stage === "set" && (
//             <>
//               <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
//                 Set a new password
//               </h1>

//               {verifying ? (
//                 <p className="text-sm text-gray-600 dark:text-gray-400">Verifying link…</p>
//               ) : (
//                 <>
//                   {accountEmail && (
//                     <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
//                       Resetting password for <span className="font-medium">{accountEmail}</span>
//                     </p>
//                   )}

//                   {/* New password */}
//                   <div className="mb-3 relative">
//                     <input
//                       type={showPw ? "text" : "password"}
//                       placeholder="New password"
//                       className="w-full border border-gray-300 dark:border-gray-700 rounded-md px-4 py-2
//                                  bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100
//                                  placeholder-gray-400 dark:placeholder-gray-500
//                                  focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent pr-10"
//                       value={newPw}
//                       onChange={(e) => setNewPw(e.target.value)}
//                       disabled={updating}
//                       autoComplete="new-password"
//                     />
//                     <button
//                       type="button"
//                       onClick={() => setShowPw((s) => !s)}
//                       className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
//                       aria-label="Toggle password visibility"
//                     >
//                       <svg className="h-5 w-5 text-gray-500" viewBox="0 0 24 24" fill="none">
//                         <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" stroke="currentColor" strokeWidth="1.5"/>
//                         <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5"/>
//                       </svg>
//                     </button>
//                   </div>

//                   {/* Confirm password */}
//                   <div className="mb-4 relative">
//                     <input
//                       type={showPw2 ? "text" : "password"}
//                       placeholder="Confirm new password"
//                       className="w-full border border-gray-300 dark:border-gray-700 rounded-md px-4 py-2
//                                  bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100
//                                  placeholder-gray-400 dark:placeholder-gray-500
//                                  focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent pr-10"
//                       value={newPw2}
//                       onChange={(e) => setNewPw2(e.target.value)}
//                       disabled={updating}
//                       autoComplete="new-password"
//                     />
//                     <button
//                       type="button"
//                       onClick={() => setShowPw2((s) => !s)}
//                       className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
//                       aria-label="Toggle password visibility"
//                     >
//                       <svg className="h-5 w-5 text-gray-500" viewBox="0 0 24 24" fill="none">
//                         <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" stroke="currentColor" strokeWidth="1.5"/>
//                         <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5"/>
//                       </svg>
//                     </button>
//                   </div>

//                   <button
//                     onClick={handleConfirm}
//                     disabled={updating}
//                     className={`w-full rounded-md text-white py-2 ${
//                       updating ? "bg-blue-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700"
//                     }`}
//                   >
//                     {updating ? "Updating..." : "Update password"}
//                   </button>

//                   <div className="mt-4 text-sm text-gray-600 dark:text-gray-400">
//                     Changed your mind?{" "}
//                     <Link className="text-blue-600 hover:underline" href="/signin">
//                       Back to sign in
//                     </Link>
//                   </div>
//                 </>
//               )}
//             </>
//           )}
//         </div>
//       </div>
//     </>
//   );
// }
