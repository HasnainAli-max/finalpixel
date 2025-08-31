// pages/utility.js
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { getFirestore, doc, getDoc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth } from '../lib/firebase/config';
import ExportPDF from '../components/ExportPDF';
import Navbar from '../components/Navbar';
import LoadingSpinner from '../components/LoadingSpinner';
import ReactMarkdown from 'react-markdown';

const PLAN_LIMITS = { basic: 1, pro: 2, elite: 3 };

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

// --- helpers for local caching ---
function todayStr() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}
function remainingKey(uid, plan) {
  const planSafe = plan || 'none';
  return `pp_remaining_${uid}_${planSafe}_${todayStr()}`;
}
function subCacheKey(uid) {
  return `pp_sub_cache_${uid}`;
}

export default function UtilityPage() {
  const [image1, setImage1] = useState(null);
  const [image2, setImage2] = useState(null);
  const [loading, setLoading] = useState(false);
  const [comparisonResult, setComparisonResult] = useState(null);
  const [darkMode, setDarkMode] = useState(false);
  const [fileMeta, setFileMeta] = useState({});
  const [user, setUser] = useState(null);

  // NEW: track when auth listener has fired at least once
  const [authChecked, setAuthChecked] = useState(false);

  // plan/limits UI (Stripe is source of truth; Firestore is fallback)
  const [planName, setPlanName] = useState(null);
  const [dailyLimit, setDailyLimit] = useState(null);
  const [remaining, setRemaining] = useState(null);

  // Stripe-driven authority for subscription
  const [subActive, setSubActive] = useState(false);
  const [subStatus, setSubStatus] = useState(null);

  // flags to avoid flicker of "no plan" block
  const [fsLoaded, setFsLoaded] = useState(false);
  const [subChecked, setSubChecked] = useState(false);

  const router = useRouter();

  // ---------- Custom Modal State ----------
  const [modal, setModal] = useState({
    open: false,
    title: '',
    message: '',
    actions: [], // [{ label: 'Upgrade Plan', onClick: () => {} }]
  });

  const openModal = ({ title, message, actions = [] }) =>
    setModal({ open: true, title, message, actions });

  const closeModal = () => setModal((m) => ({ ...m, open: false }));

  // Auth guard + seed from local cache immediately (no flicker)
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      if (u) {
        setUser(u);

        // 1) Seed quickly from local cache if available (prevents "no plan" flash)
        try {
          const raw = localStorage.getItem(subCacheKey(u.uid));
          if (raw) {
            const cache = JSON.parse(raw);
            if (typeof cache?.active === 'boolean') {
              setSubActive(!!cache.active);
            }
            if (cache?.plan && PLAN_LIMITS[cache.plan] != null) {
              setPlanName(cache.plan);
              setDailyLimit(PLAN_LIMITS[cache.plan]);
            }
          }
        } catch {}

        // 2) Firestore fallback seed
        try {
          const db = getFirestore();
          const snap = await getDoc(doc(db, 'users', u.uid));
          const d = snap.exists() ? snap.data() : {};
          const rawPlan = String(d?.activePlan || d?.plan || d?.tier || '').toLowerCase();
          const max = PLAN_LIMITS[rawPlan] ?? 0;
          setPlanName((p) => p || rawPlan || null); // don't overwrite cache if it already set
          if (max) setDailyLimit((dl) => (typeof dl === 'number' ? dl : max));
        } catch {
          // ignore
        } finally {
          setFsLoaded(true);
        }
      } else {
        setUser(null);
        setFsLoaded(true);
      }
      setAuthChecked(true);
    });
    return () => unsubscribe();
  }, []);

  // Redirect decision AFTER auth is checked (flicker-proof)
  useEffect(() => {
    if (!authChecked) return;

    if (!user) {
      let justSignedUp = false;
      try { justSignedUp = !!localStorage.getItem('justSignedUp'); } catch {}
      if (justSignedUp) return;
      router.replace('/login');
    } else {
      try { localStorage.removeItem('justSignedUp'); } catch {}
    }
  }, [authChecked, user, router]);

  // ---- Single-active-session guard (minimal + safe) ----
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
        signOut(auth).catch(() => {});
      }
    });
    return () => unsub();
  }, [user?.uid]);

  // Theme toggle (unchanged)
  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
  }, [darkMode]);

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      router.replace('/login');
    } catch {
      openModal({
        title: 'Sign out failed',
        message: 'We could not sign you out. Please try again.',
        actions: [
          { label: 'Try Again', onClick: () => { closeModal(); handleSignOut(); } },
        ],
      });
    }
  };

  // -------- Customer Portal helper (used by "Upgrade Plan") --------
  const goToCustomerPortal = async () => {
    try {
      const u = auth.currentUser;
      if (!u) {
        closeModal();
        router.push('/login');
        return;
      }
      const idToken = await u.getIdToken();
      const res = await fetch('/api/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.url) {
        closeModal();
        window.location.href = data.url;
      } else {
        openModal({
          title: 'Unable to open portal',
          message: data?.error || 'We could not open the customer portal. Please try again.',
          actions: [{ label: 'Try Again', onClick: () => { closeModal(); goToCustomerPortal(); } }],
        });
      }
    } catch (e) {
      openModal({
        title: 'Unable to open portal',
        message: 'A network error occurred. Please check your connection and try again.',
        actions: [{ label: 'Try Again', onClick: () => { closeModal(); goToCustomerPortal(); } }],
      });
    }
  };

  // ---------- Friendly error helper -> uses modal ----------
  function showFriendlyError({ status, code, msg }) {
    const m = String(msg || '').toLowerCase();

    // helper to persist remaining whenever we set it here
    const persistRemaining = (val) => {
      setRemaining(val);
      try {
        if (user?.uid) localStorage.setItem(remainingKey(user.uid, planName), String(val));
      } catch {}
    };

    if (status === 401 && /invalid|expired|token|unauthorized/.test(m)) {
      openModal({
        title: 'Session expired',
        message: 'Your session has expired. Please sign in again to continue.',
        actions: [
          { label: 'Sign In', onClick: () => { closeModal(); router.push('/login'); } },
        ],
      });
      return;
    }

    if (code === 'NO_PLAN' || /no active subscription|buy a plan|no active plan/.test(m)) {
      openModal({
        title: 'No active subscription',
        message: 'You do not have an active plan. To run comparisons, please choose a plan.',
        actions: [
          { label: 'View Plans', onClick: () => { closeModal(); router.push('/'); } },
        ],
      });
      persistRemaining(0);
      return;
    }

    if (status === 429 || code === 'LIMIT_EXCEEDED' || /daily limit/.test(m)) {
      openModal({
        title: 'Daily limit reached',
        message: 'You have reached the daily comparison limit for your plan. Upgrade to run more comparisons today.',
        actions: [
          { label: 'Upgrade Plan', onClick: () => { goToCustomerPortal(); } },
        ],
      });
      persistRemaining(0);
      return;
    }

    if (status === 400) {
      if (/both images are required/i.test(m)) {
        openModal({
          title: 'Two images required',
          message: 'Please upload both the design and the development screenshot before starting a comparison.',
          actions: [
            { label: 'Got it', onClick: () => { closeModal(); } },
          ],
        });
        return;
      }
      if (/only jpg|png|webp/i.test(m)) {
        openModal({
          title: 'Unsupported image format',
          message: 'Use JPG, PNG, or WEBP files (minimum width 500px) for best results.',
          actions: [
            { label: 'Got it', onClick: () => { closeModal(); } },
          ],
        });
        return;
      }
    }

    if (/failed to fetch|network/.test(m)) {
      openModal({
        title: 'Network issue',
        message: 'We could not reach the server. Please check your internet connection and try again.',
        actions: [
          { label: 'Retry', onClick: () => { closeModal(); } },
        ],
      });
      return;
    }

    openModal({
      title: 'Comparison failed',
      message: 'We couldn’t complete the comparison. Please try again in a minute.',
      actions: [
        { label: 'Retry', onClick: () => { closeModal(); } },
      ],
    });
  }

  // ----- Ask server (Stripe) for current subscription status -----
  useEffect(() => {
    const run = async () => {
      if (!authChecked || !user) return;
      try {
        const idToken = await auth.currentUser.getIdToken();
        const res = await fetch('/api/subscription-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        });
        const data = await res.json().catch(() => ({}));

        if (res.ok) {
          setSubActive(!!data.active);
          setSubStatus(data.status || null);

          // cache result to avoid refresh flicker later
          try {
            localStorage.setItem(
              subCacheKey(user.uid),
              JSON.stringify({ active: !!data.active, plan: data.plan || null, status: data.status || null, t: Date.now() })
            );
          } catch {}

          if (data.plan && PLAN_LIMITS[data.plan] != null) {
            setPlanName(data.plan);
            setDailyLimit(PLAN_LIMITS[data.plan]);
          }
        } else {
          console.warn('subscription-status error:', data?.error || res.status);
        }
      } catch (e) {
        console.warn('subscription-status fetch failed:', e);
      } finally {
        setSubChecked(true);
      }
    };
    run();
  }, [authChecked, user]);

  // ----- Initialize/persist remaining whenever plan/limit ready -----
  useEffect(() => {
    if (!user?.uid) return;
    if (typeof dailyLimit !== 'number') return;

    // load from localStorage (per day, per plan). If none, seed with full dailyLimit.
    try {
      const key = remainingKey(user.uid, planName);
      const raw = localStorage.getItem(key);
      const stored = raw != null ? parseInt(raw, 10) : NaN;
      const next = Number.isFinite(stored) ? Math.max(0, Math.min(dailyLimit, stored)) : dailyLimit;
      setRemaining(next);
      localStorage.setItem(key, String(next)); // ensure it exists for future refreshes
    } catch {
      setRemaining(dailyLimit);
    }
  }, [user?.uid, planName, dailyLimit]);

  const handleCompare = async () => {
    if (!image1 || !image2) {
      openModal({
        title: 'Two images required',
        message: 'Please upload both the design and the development screenshot before starting a comparison.',
        actions: [{ label: 'Got it', onClick: () => { closeModal(); } }],
      });
      return;
    }

    setLoading(true);
    setComparisonResult(null);

    try {
      const token = await auth.currentUser.getIdToken();

      const formData = new FormData();
      formData.append('image1', image1);
      formData.append('image2', image2);

      setFileMeta({
        fileName1: image1.name,
        fileName2: image2.name,
        timestamp: new Date().toLocaleString(),
      });

      const response = await fetch('/api/compare', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      const raw = await response.text();
      let data;
      try {
        data = JSON.parse(raw);
      } catch {
        data = { error: raw || 'Unknown server response' };
      }

      if (!response.ok) {
        const code = data?.error_code || '';
        const msg = data?.error || 'Server error';
        showFriendlyError({ status: response.status, code, msg });
        throw new Error(String(msg));
      }

      if (!data.result) throw new Error('Comparison result missing in response.');

      setComparisonResult(data.result);

      // decrement + persist remaining locally
      setRemaining((prev) => {
        const next = typeof prev === 'number'
          ? Math.max(prev - 1, 0)
          : (typeof dailyLimit === 'number' ? Math.max(dailyLimit - 1, 0) : 0);
        try {
          if (user?.uid) localStorage.setItem(remainingKey(user.uid, planName), String(next));
        } catch {}
        return next;
      });
    } catch (error) {
      console.error('Comparison failed:', error);
    } finally {
      setLoading(false);
    }
  };

  // ---- SUBSCRIPTION-BASED UI STATE ----
  const hasActivePlan = subActive || (typeof dailyLimit === 'number' && dailyLimit > 0);
  // Only show the "no plan" UI once at least one backend check has finished
  const showNoPlanUI = (!hasActivePlan) && (fsLoaded || subChecked);

  // File input button styling
  const fileInputBase =
    "w-full cursor-pointer file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold";
  const fileInputStyleActive =
    "file:bg-purple-600 file:text-white hover:file:bg-purple-700 hover:file:text-white";
  const fileInputStyleInactive =
    "file:bg-purple-100 file:text-purple-900 hover:file:bg-purple-200 hover:file:text-white";

  const renderPreview = (file) =>
    file ? (
      <img
        src={URL.createObjectURL(file)}
        alt="Preview"
        className="rounded shadow h-40 object-contain w-full mt-2"
      />
    ) : null;

  if (!user) {
    return <></>;
  }

  return (
    <div className="min-h-screen bg-white text-gray-900 dark:bg-gray-900 dark:text-white font-sans">
      <Navbar user={user} onSignOut={handleSignOut} />

      <div className="p-6 max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-purple-800 dark:text-purple-300">PixelProof</h1>
          <button
            className="bg-purple-100 dark:bg-purple-700 hover:bg-purple-200 dark:hover:bg-purple-600 p-2 rounded transition"
            onClick={() => setDarkMode(!darkMode)}
            title="Toggle theme"
          >
            {darkMode ? '🌙' : '☀️'}
          </button>
        </div>

        <p className="text-lg font-semibold">Design QA, Automated with AI</p>
        <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
          Upload your original design and final build screenshots. Let AI catch visual bugs before your clients do.
        </p>

        <p className="text-sm text-gray-700 dark:text-gray-300 mb-6">
          Remaining comparisons today:{' '}
          <strong>
            {typeof remaining === 'number' && typeof dailyLimit === 'number'
              ? `${remaining}/${dailyLimit}`
              : '—'}
          </strong>
          {planName ? ` (plan: ${planName}${subStatus ? ` • ${subStatus}` : ''})` : (subStatus ? ` (${subStatus})` : '')}
        </p>

        <div className="border p-4 rounded bg-gray-50 dark:bg-gray-800 prose dark:prose-invert mb-10">
          <h2 className="font-semibold">How to Use</h2>
          <ul>
            <li>Upload the design and development screenshots</li>
            <li>Supported: JPG, PNG, WEBP – min width 500px</li>
            <li>Ensure matching layout and scale</li>
          </ul>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Upload Design */}
          <div className="border-2 border-dashed border-purple-300 p-6 rounded-lg text-center bg-white dark:bg-gray-700 hover:border-purple-500 transition transform hover:scale-[1.01]">
            <label className="block font-semibold text-gray-800 dark:text-white mb-2">Upload Design</label>
            <input
              type="file"
              onChange={(e) => setImage1(e.target.files[0])}
              accept="image/*"
              className={`${fileInputBase} ${hasActivePlan ? fileInputStyleActive : fileInputStyleInactive}`}
            />
            {renderPreview(image1)}
          </div>

          {/* Upload Dev */}
          <div className="border-2 border-dashed border-purple-300 p-6 rounded-lg text-center bg-white dark:bg-gray-700 hover:border-purple-500 transition transform hover:scale-[1.01]">
            <label className="block font-semibold text-gray-800 dark:text-white mb-2">Upload Development Screenshot</label>
            <input
              type="file"
              onChange={(e) => setImage2(e.target.files[0])}
              accept="image/*"
              className={`${fileInputBase} ${hasActivePlan ? fileInputStyleActive : fileInputStyleInactive}`}
            />
            {renderPreview(image2)}
          </div>
        </div>

        <div className="mt-10 flex items-center gap-4 flex-wrap">
          <button
            onClick={handleCompare}
            disabled={!hasActivePlan || loading}
            className={`bg-purple-800 hover:bg-purple-900 text-white px-6 py-3 rounded-lg font-semibold shadow transition
              ${(!hasActivePlan || loading) ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            {loading ? 'Comparing...' : 'Start Comparison'}
          </button>

          {/* If NO active subscription, show buy-plan hint + Plans button (only after checks ready) */}
          {showNoPlanUI && (
            <>
              <span className="text-sm text-red-600">
                You don&apos;t have plan — first buy the plan.
              </span>
              <button
                onClick={() => router.push('/')}
                className="bg-purple-800 hover:bg-purple-900 text-white px-4 py-2 rounded-lg font-semibold shadow transition"
              >
                Plans
              </button>
            </>
          )}
        </div>

        {loading && <LoadingSpinner />}

        {comparisonResult && (
          <div className="mt-10 bg-gray-100 dark:bg-gray-800 p-6 rounded-lg shadow-lg">
            <h2 className="text-xl font-bold mb-4 text-purple-800 dark:text-purple-300">Visual Bug Report</h2>
            <ul className="text-sm mb-4">
              <li><strong>File 1:</strong> {fileMeta.fileName1}</li>
              <li><strong>File 2:</strong> {fileMeta.fileName2}</li>
              <li><strong>Timestamp:</strong> {fileMeta.timestamp}</li>
            </ul>
            <div className="prose dark:prose-invert max-w-none text-sm">
              <ReactMarkdown>{comparisonResult}</ReactMarkdown>
            </div>
            <ExportPDF result={comparisonResult} />
          </div>
        )}
      </div>

      {/* ---------- Custom Modal ---------- */}
      <div
        className={`fixed inset-0 z-[100] transition-opacity duration-200 ${modal.open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        onClick={closeModal}
        aria-hidden={!modal.open}
      >
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/40" />

        {/* Panel */}
        <div className="absolute inset-0 flex items-center justify-center p-4">
          <div
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            className={`w-full max-w-md rounded-xl bg-white dark:bg-gray-900 shadow-2xl border border-gray-200 dark:border-gray-800 p-5 transform transition-all duration-200
              ${modal.open ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-2'}
            `}
          >
            <div className="flex items-start justify-between mb-3">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{modal.title}</h3>
              <button
                onClick={closeModal}
                aria-label="Close"
                className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
              >
                {/* X icon */}
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>

            <p className="text-sm text-gray-700 dark:text-gray-300 mb-5">{modal.message}</p>

            <div className="flex flex-wrap gap-3 justify-end">
              {modal.actions?.map((a, idx) => (
                <button
                  key={idx}
                  onClick={a.onClick}
                  className="bg-purple-800 hover:bg-purple-900 text-white px-4 py-2 rounded-lg font-semibold shadow transition"
                >
                  {a.label}
                </button>
              ))}
              {/* Default close if no actions */}
              {(!modal.actions || modal.actions.length === 0) && (
                <button
                  onClick={closeModal}
                  className="bg-purple-800 hover:bg-purple-900 text-white px-4 py-2 rounded-lg font-semibold shadow transition"
                >
                  Close
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modal animation helper (no heavy CSS) */}
      <style jsx>{``}</style>
    </div>
  );
}
