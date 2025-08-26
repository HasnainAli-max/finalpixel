// pages/contactus.js
import Head from "next/head";
import { useEffect, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase/config";
import Navbar from "@/components/Navbar";
import { Toaster, toast } from "sonner";

export default function ContactUs() {
  const [user, setUser] = useState(null);

  // form state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u || null));
    return () => unsub();
  }, []);

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch (e) {
      console.error("Sign out failed:", e);
    }
  };

  const validate = () => {
    if (!name.trim()) {
      toast.error("Please enter your name.");
      return false;
    }
    if (!email.trim() || !/^\S+@\S+\.\S+$/.test(email)) {
      toast.error("Please enter a valid email.");
      return false;
    }
    if (!message.trim() || message.trim().length < 10) {
      toast.error("Message must be at least 10 characters.");
      return false;
    }
    return true;
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    try {
      setSubmitting(true);
      await addDoc(collection(db, "contactMessages"), {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        message: message.trim(),
        uid: user?.uid || null,
        createdAt: serverTimestamp(),
        status: "new",
      });

      setName("");
      setEmail("");
      setMessage("");
      toast.success("Thanks! Your message has been sent.");
    } catch (err) {
      console.error(err);
      toast.error("Could not send message. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Head>
        <title>Contact Us – PixelProof</title>
      </Head>

      {/* Sonner toasts */}
      <Toaster richColors position="top-right" />

      {/* Same Navbar as Utility page */}
      <Navbar user={user} onSignOut={handleSignOut} />

      <main className="min-h-screen bg-gradient-to-b from-[#f7f8ff] to-white dark:from-slate-950 dark:to-slate-900 text-slate-800 dark:text-slate-100">
        <section className="max-w-3xl mx-auto px-6 py-14 md:py-20">
          <header className="mb-8">
            <h1 className="text-3xl sm:text-4xl font-extrabold leading-tight">
              Get in <span className="text-[#6c2bd9]">touch</span>
            </h1>
            <p className="mt-2 text-slate-600 dark:text-slate-300">
              Have a question or feedback? Send us a message and we’ll get back soon.
            </p>
          </header>

          <form
            onSubmit={onSubmit}
            className="rounded-2xl p-6 sm:p-8 bg-white dark:bg-slate-800 ring-1 ring-black/5 dark:ring-white/10 shadow-sm"
          >
            {/* Name */}
            <label className="block mb-4">
              <span className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                Name
              </span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your full name"
                className="mt-1 w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 h-11 outline-none focus:ring-2 focus:ring-[#6c2bd9] dark:focus:ring-violet-600"
                required
              />
            </label>

            {/* Email */}
            <label className="block mb-4">
              <span className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                Email
              </span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="mt-1 w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 h-11 outline-none focus:ring-2 focus:ring-[#6c2bd9] dark:focus:ring-violet-600"
                required
              />
            </label>

            {/* Message */}
            <label className="block mb-6">
              <span className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                Message
              </span>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="How can we help?"
                rows={6}
                className="mt-1 w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-3 outline-none focus:ring-2 focus:ring-[#6c2bd9] dark:focus:ring-violet-600 resize-y"
                required
              />
              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {Math.max(0, message.length)} characters
              </div>
            </label>

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center justify-center h-11 px-6 rounded-xl bg-[#6c2bd9] text-white font-medium shadow-sm hover:brightness-95 disabled:opacity-60 transition"
            >
              {submitting ? "Sending…" : "Send message"}
            </button>
          </form>
        </section>
      </main>
    </>
  );
}
