// pages/utility.js
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/router';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { getFirestore, doc, getDoc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth } from '../lib/firebase/config';
import ExportPDF from '../components/ExportPDF';
import Navbar from '../components/Navbar';
import LoadingSpinner from '../components/LoadingSpinner';
import ReactMarkdown from 'react-markdown';

const PLAN_LIMITS = { basic: 1, pro: 2, elite: 3 };
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024;
// We still write a short-lived cache, but we DO NOT rely on it for initial render.
// This avoids the "buy a plan" flicker after payment.
const SUB_CACHE_TTL_MS = 60 * 1000;

function getOrCreateSessionId() {
  try {
    let id = localStorage.getItem('pp_session_id');
    if (!id) {
      id =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : Math.random().toString(36).slice(2);
      localStorage.setItem('pp_session_id', id);
    }
    return id;
  } catch {
    return 'fallback-session';
  }
}
function todayStr() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}
// Used-count is authoritative for the day (prevents downgrade loophole)
function usedKey(uid) {
  return `pp_used_${uid}_${todayStr()}`;
}
function subCacheKey(uid) {
  return `pp_sub_cache_${uid}`;
}
function validateFile(file) {
  if (!file) return { ok: false, msg: 'No file' };
  if (!ALLOWED_TYPES.has(file.type)) return { ok: false, msg: 'Unsupported type' };
  if (file.size > MAX_FILE_SIZE_BYTES) return { ok: false, msg: 'File too large (max 15MB)' };
  return { ok: true };
}
function useObjectUrl(file) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    if (!file) return setUrl(null);
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => {
      try {
        URL.revokeObjectURL(u);
      } catch {}
    };
  }, [file]);
  return url;
}

function nextMidnightLocal() {
  const d = new Date();
  d.setHours(24, 0, 0, 0);
  return d;
}
function formatTime(dt) {
  const h = dt.getHours(),
    m = String(dt.getMinutes()).padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hh = ((h + 11) % 12) + 1;
  const date = `${String(dt.getMonth() + 1).padStart(2, '0')}/${String(dt.getDate()).padStart(
    2,
    '0'
  )}/${dt.getFullYear()}`;
  return `${date} • ${hh}:${m} ${ampm}`;
}

export default function UtilityPage() {
  const [image1, setImage1] = useState(null);
  const [image2, setImage2] = useState(null);
  const [loading, setLoading] = useState(false);
  const [comparisonResult, setComparisonResult] = useState(null);
  const [darkMode, setDarkMode] = useState(false);
  const [fileMeta, setFileMeta] = useState({});
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  const [planName, setPlanName] = useState(null);
  const [dailyLimit, setDailyLimit] = useState(null);
  const [usedTodayCount, setUsedTodayCount] = useState(null);

  const [subActive, setSubActive] = useState(false);
  const [subStatus, setSubStatus] = useState(null);

  const [fsLoaded, setFsLoaded] = useState(false);

  // Subscription fetch flags
  const [subChecked, setSubChecked] = useState(false);
  const [subLoading, setSubLoading] = useState(false); // for entry loader

  const compareInFlight = useRef(false);
  const subReqAbort = useRef(null);

  const router = useRouter();

  const [modal, setModal] = useState({ open: false, title: '', message: '', actions: [] });
  const openModal = useCallback(
    ({ title, message, actions = [] }) => setModal({ open: true, title, message, actions }),
    []
  );
  const closeModal = useCallback(() => setModal((m) => ({ ...m, open: false })), []);

  const [limitModalOpen, setLimitModalOpen] = useState(false);

  // Theme
  useEffect(() => {
    try {
      const s = localStorage.getItem('pp_dark');
      if (s != null) setDarkMode(s === '1');
    } catch {}
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    try {
      localStorage.setItem('pp_dark', darkMode ? '1' : '0');
    } catch {}
  }, [darkMode]);

  // Auth + quick seeds (cache + Firestore for banner/no-flicker)
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (u) {
        setUser(u);
        // Read cache only to prefill banner quickly (we will still do a live fetch)
        try {
          const raw = localStorage.getItem(subCacheKey(u.uid));
          if (raw) {
            const cache = JSON.parse(raw);
            if (typeof cache?.active === 'boolean') setSubActive(!!cache.active);
            if (cache?.plan && PLAN_LIMITS[cache.plan] != null) {
              setPlanName(cache.plan);
              setDailyLimit((dl) => (typeof dl === 'number' ? dl : PLAN_LIMITS[cache.plan]));
            }
            setSubStatus(cache.status || null);
          }
        } catch {}
        // Firestore seed for plan name (prevents flicker)
        try {
          const db = getFirestore();
          const snap = await getDoc(doc(db, 'users', u.uid));
          const d = snap.exists() ? snap.data() : {};
          const rawPlan = String(d?.activePlan || d?.plan || d?.tier || '').toLowerCase();
          const max = PLAN_LIMITS[rawPlan] ?? 0;
          setPlanName((p) => p || rawPlan || null);
          if (max) setDailyLimit((dl) => (typeof dl === 'number' ? dl : max));
        } catch {} finally {
          setFsLoaded(true);
        }
      } else {
        setUser(null);
        setFsLoaded(true);
      }
      setAuthChecked(true);
    });
    return () => unsub();
  }, []);

  // Redirect after auth check
  useEffect(() => {
    if (!authChecked) return;
    if (!user) {
      let justSignedUp = false;
      try {
        justSignedUp = !!localStorage.getItem('justSignedUp');
      } catch {}
      if (justSignedUp) return;
      router.replace('/login');
    } else {
      try {
        localStorage.removeItem('justSignedUp');
      } catch {}
    }
  }, [authChecked, user, router]);

  // Single-session guard
  useEffect(() => {
    if (!user?.uid) return;
    const db = getFirestore();
    const ref = doc(db, 'users', user.uid);
    const mySessionId = getOrCreateSessionId();
    setDoc(
      ref,
      { activeSessionId: mySessionId, sessionUpdatedAt: serverTimestamp() },
      { merge: true }
    ).catch(() => {});
    const unsub = onSnapshot(ref, (snap) => {
      const data = snap.exists() ? snap.data() : {};
      const active = data?.activeSessionId;
      if (active && active !== mySessionId) {
        signOut(auth).catch(() => {});
      }
    });
    return () => unsub();
  }, [user?.uid]);

  const handleSignOut = useCallback(async () => {
    try {
      await signOut(auth);
      router.replace('/login');
    } catch {
      openModal({
        title: 'Sign out failed',
        message: 'We could not sign you out. Please try again.',
        actions: [
          {
            label: 'Try Again',
            onClick: () => {
              closeModal();
              handleSignOut();
            },
          },
        ],
      });
    }
  }, [router, openModal, closeModal]);

  const goToCustomerPortal = useCallback(async () => {
    try {
      const u = auth.currentUser;
      if (!u) {
        setLimitModalOpen(false);
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
        setLimitModalOpen(false);
        closeModal();
        window.location.href = data.url;
      } else {
        openModal({
          title: 'Unable to open portal',
          message: data?.error || 'We could not open the customer portal. Please try again.',
          actions: [
            {
              label: 'Try Again',
              onClick: () => {
                closeModal();
                goToCustomerPortal();
              },
            },
          ],
        });
      }
    } catch {
      openModal({
        title: 'Unable to open portal',
        message: 'A network error occurred. Please check your connection and try again.',
        actions: [
          {
            label: 'Try Again',
            onClick: () => {
              closeModal();
              goToCustomerPortal();
            },
          },
        ],
      });
    }
  }, [router, openModal, closeModal]);

  // Friendly error + zero-remaining helper (sets used = limit)
  const showFriendlyError = useCallback(
    ({ status, code, msg }) => {
      const m = String(msg || '').toLowerCase();
      const setUsedToLimit = () => {
        if (typeof effectiveLimit === 'number') {
          setUsedTodayCount(effectiveLimit);
          try {
            if (user?.uid) localStorage.setItem(usedKey(user.uid), String(effectiveLimit));
          } catch {}
        }
      };

      if (status === 401 && /invalid|expired|token|unauthorized/.test(m)) {
        openModal({
          title: 'Session expired',
          message: 'Your session has expired. Please sign in again to continue.',
          actions: [
            {
              label: 'Sign In',
              onClick: () => {
                closeModal();
                router.push('/login');
              },
            },
          ],
        });
        return;
      }
      if (code === 'NO_PLAN' || /no active subscription|buy a plan|no active plan/.test(m)) {
        openModal({
          title: 'No active subscription',
          message: 'You do not have an active plan. To run comparisons, please choose a plan.',
          actions: [
            {
              label: 'View Plans',
              onClick: () => {
                closeModal();
                router.push('/');
              },
            },
          ],
        });
        setUsedToLimit();
        return;
      }
      if (status === 429 || code === 'LIMIT_EXCEEDED' || /daily limit/.test(m)) {
        setLimitModalOpen(true);
        setUsedToLimit();
        return;
      }
      if (status === 400) {
        if (/both images are required/i.test(m)) {
          openModal({
            title: 'Two images required',
            message:
              'Please upload both the design and the development screenshot before starting a comparison.',
            actions: [{ label: 'Got it', onClick: () => { closeModal(); } }],
          });
          return;
        }
        if (/only jpg|png|webp/i.test(m)) {
          openModal({
            title: 'Unsupported image format',
            message: 'Use JPG, PNG, or WEBP files (minimum width 500px) for best results.',
            actions: [{ label: 'Got it', onClick: () => { closeModal(); } }],
          });
          return;
        }
      }
      if (/failed to fetch|network/.test(m)) {
        openModal({
          title: 'Network issue',
          message: 'We could not reach the server. Please check your internet connection and try again.',
          actions: [{ label: 'Retry', onClick: () => { closeModal(); } }],
        });
        return;
      }
      openModal({
        title: 'Comparison failed',
        message: 'We couldn’t complete the comparison. Please try again in a minute.',
        actions: [{ label: 'Retry', onClick: () => { closeModal(); } }],
      });
    },
    // effectiveLimit is derived; safe to omit to avoid re-creating handler
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [router, closeModal, openModal, user?.uid]
  );

  // 🔒 Force a LIVE subscription-status fetch on entry (no TTL, no stale reads).
  // Shows a small blocking loader so the UI never flashes "buy a plan" incorrectly.
  useEffect(() => {
    if (!authChecked || !user) return;

    const run = async () => {
      if (subReqAbort.current) {
        try { subReqAbort.current.abort(); } catch {}
      }
      const controller = new AbortController();
      subReqAbort.current = controller;
      setSubLoading(true);
      try {
        const idToken = await auth.currentUser.getIdToken();
        const res = await fetch('/api/subscription-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
          signal: controller.signal,
        });
        const data = await res.json().catch(() => ({}));

        if (res.ok) {
          setSubActive(!!data.active);
          setSubStatus(data.status || null);
          try {
            localStorage.setItem(
              subCacheKey(user.uid),
              JSON.stringify({
                active: !!data.active,
                plan: data.plan || null,
                status: data.status || null,
                t: Date.now(),
              })
            );
          } catch {}
          if (data.plan && PLAN_LIMITS[data.plan] != null) {
            setPlanName(data.plan);
            setDailyLimit(PLAN_LIMITS[data.plan]);
          } else {
            // if no plan, clear planName/dailyLimit
            setPlanName(null);
            setDailyLimit(null);
          }
        } else {
          console.warn('subscription-status error:', data?.error || res.status);
        }
      } catch (e) {
        if (e?.name !== 'AbortError') console.warn('subscription-status fetch failed:', e);
      } finally {
        subReqAbort.current = null;
        setSubChecked(true);
        // tiny delay keeps UX smooth without feeling laggy
        setTimeout(() => setSubLoading(false), 150);
      }
    };

    run();
    return () => {
      if (subReqAbort.current) {
        try { subReqAbort.current.abort(); } catch {}
        subReqAbort.current = null;
      }
    };
  }, [authChecked, user]);

  // Also refetch on return from Stripe (if URL has success/canceled/session_id)
  useEffect(() => {
    if (!user) return;
    const hasStripeParams =
      typeof window !== 'undefined' &&
      /(?:success|canceled|session_id|portal)=/.test(window.location.search);
    if (!hasStripeParams) return;

    (async () => {
      setSubLoading(true);
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
          if (data.plan && PLAN_LIMITS[data.plan] != null) {
            setPlanName(data.plan);
            setDailyLimit(PLAN_LIMITS[data.plan]);
          } else {
            setPlanName(null);
            setDailyLimit(null);
          }
          try {
            localStorage.setItem(
              subCacheKey(user.uid),
              JSON.stringify({
                active: !!data.active,
                plan: data.plan || null,
                status: data.status || null,
                t: Date.now(),
              })
            );
          } catch {}
        }
      } finally {
        setSubLoading(false);
      }
    })();
  }, [user]);

  // Compute limit from current plan
  const effectiveLimit =
    typeof dailyLimit === 'number' && dailyLimit >= 0
      ? dailyLimit
      : planName && PLAN_LIMITS[planName] != null
      ? PLAN_LIMITS[planName]
      : null;

  // Load USED count for today (per user)
  useEffect(() => {
    if (!user?.uid) return;
    try {
      const raw = localStorage.getItem(usedKey(user.uid));
      const stored = raw != null ? parseInt(raw, 10) : NaN;
      const nextUsed = Number.isFinite(stored) ? Math.max(0, stored) : 0;
      setUsedTodayCount(nextUsed);
    } catch {
      setUsedTodayCount(0);
    }
  }, [user?.uid]);

  // Remaining derived from used + limit
  const remaining = useMemo(() => {
    if (typeof effectiveLimit !== 'number' || typeof usedTodayCount !== 'number') return null;
    return Math.max(0, effectiveLimit - usedTodayCount);
  }, [effectiveLimit, usedTodayCount]);

  const onPickImage1 = useCallback(
    (e) => {
      const f = e.target.files?.[0];
      const v = validateFile(f);
      if (!v.ok) {
        setImage1(null);
        openModal({
          title: 'Invalid file',
          message: v.msg === 'Unsupported type' ? 'Use JPG, PNG, or WEBP files.' : 'Max size is 15MB.',
        });
        return;
      }
      setImage1(f);
    },
    [openModal]
  );
  const onPickImage2 = useCallback(
    (e) => {
      const f = e.target.files?.[0];
      const v = validateFile(f);
      if (!v.ok) {
        setImage2(null);
        openModal({
          title: 'Invalid file',
          message: v.msg === 'Unsupported type' ? 'Use JPG, PNG, or WEBP files.' : 'Max size is 15MB.',
        });
        return;
      }
      setImage2(f);
    },
    [openModal]
  );

  const getFreshIdToken = useCallback(async () => {
    const u = auth.currentUser;
    if (!u) throw new Error('Please sign in first.');
    try {
      return await u.getIdToken();
    } catch {
      return await u.getIdToken(true);
    }
  }, []);

  const handleCompare = useCallback(async () => {
    if (compareInFlight.current) return;

    if (typeof remaining === 'number' && remaining <= 0) {
      setLimitModalOpen(true);
      return;
    }

    if (!image1 || !image2) {
      openModal({
        title: 'Two images required',
        message:
          'Please upload both the design and the development screenshot before starting a comparison.',
        actions: [{ label: 'Got it', onClick: () => { closeModal(); } }],
      });
      return;
    }
    const v1 = validateFile(image1);
    const v2 = validateFile(image2);
    if (!v1.ok || !v2.ok) {
      openModal({ title: 'Invalid file(s)', message: 'Use JPG, PNG, or WEBP (max 15MB).' });
      return;
    }

    compareInFlight.current = true;
    setLoading(true);
    setComparisonResult(null);

    try {
      const token = await getFreshIdToken();
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

      // Increment USED (not remaining)
      setUsedTodayCount((prev) => {
        const base = Number.isFinite(prev) ? prev : 0;
        const next = base + 1;
        try {
          if (user?.uid) localStorage.setItem(usedKey(user.uid), String(next));
        } catch {}
        return next;
      });
    } catch (err) {
      console.error('Comparison failed:', err);
    } finally {
      setLoading(false);
      compareInFlight.current = false;
    }
  }, [
    image1,
    image2,
    getFreshIdToken,
    showFriendlyError,
    user?.uid,
    openModal,
    closeModal,
    remaining,
  ]);

  // Plan flags
  const hasActivePlan = !!subActive || (typeof effectiveLimit === 'number' && effectiveLimit > 0);

  // 👇 No "buy a plan" banner until LIVE subscription check is done (prevents flicker).
  const showNoPlanUI = authChecked && !!user && !hasActivePlan && subChecked;

  // For modal display
  const usedToday = useMemo(() => {
    if (typeof effectiveLimit !== 'number') return null;
    const used = Math.min(effectiveLimit, Math.max(0, usedTodayCount ?? 0));
    const pct = effectiveLimit ? Math.min(100, Math.round((used / effectiveLimit) * 100)) : 0;
    return { used, pct };
  }, [usedTodayCount, effectiveLimit]);

  const resetAt = useMemo(() => formatTime(nextMidnightLocal()), []);

  const fileInputBase =
    'w-full cursor-pointer file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold';
  const fileInputStyleActive =
    'file:bg-purple-600 file:text-white hover:file:bg-purple-700 hover:file:text-white';
  const fileInputStyleInactive =
    'file:bg-purple-100 file:text-purple-900 hover:file:bg-purple-200 hover:file:text-white';

  const prev1 = useObjectUrl(image1);
  const prev2 = useObjectUrl(image2);

  // 🔄 Entry loader: block UI only until we finish the LIVE sub fetch.
  const blockingLoad = !!user && subLoading && !subChecked;

  if (!user) return <></>;

  return (
    <div className="min-h-screen bg-white text-gray-900 dark:bg-gray-900 dark:text-white font-sans">
      <Navbar user={user} onSignOut={handleSignOut} />

      {/* Entry loader overlay (quick) */}
      {blockingLoad && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-white/70 dark:bg-black/60 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3">
            <div className="animate-spin h-10 w-10 rounded-full border-4 border-purple-600 border-t-transparent" />
            <p className="text-sm text-gray-700 dark:text-gray-300">Checking subscription…</p>
          </div>
        </div>
      )}

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
          Upload your original design and final build screenshots. Let AI catch visual bugs before
          your clients do.
        </p>

        <p className="text-sm text-gray-700 dark:text-gray-300 mb-6">
          Remaining comparisons today:{' '}
          <strong>
            {typeof remaining === 'number' && typeof effectiveLimit === 'number'
              ? `${remaining}/${effectiveLimit}`
              : '—'}
          </strong>
          {planName
            ? ` (plan: ${planName}${subStatus ? ` • ${subStatus}` : ''})`
            : subStatus
            ? ` (${subStatus})`
            : ''}
        </p>

        <div className="border p-4 rounded bg-gray-50 dark:bg-gray-800 prose dark:prose-invert mb-10">
          <h2 className="font-semibold">How to Use</h2>
          <ul>
            <li>Upload the design and development screenshots</li>
            <li>Supported: JPG, PNG, WEBP – max 15MB, min width 500px</li>
            <li>Ensure matching layout and scale</li>
          </ul>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="border-2 border-dashed border-purple-300 p-6 rounded-lg text-center bg-white dark:bg-gray-700 hover:border-purple-500 transition transform hover:scale-[1.01]">
            <label className="block font-semibold text-gray-800 dark:text-white mb-2">
              Upload Design
            </label>
            <input
              type="file"
              onChange={onPickImage1}
              accept="image/jpeg,image/png,image/webp"
              className={`${fileInputBase} ${
                hasActivePlan ? fileInputStyleActive : fileInputStyleInactive
              }`}
            />
            {prev1 && (
              <img src={prev1} alt="Preview" className="rounded shadow h-40 object-contain w-full mt-2" />
            )}
          </div>

          <div className="border-2 border-dashed border-purple-300 p-6 rounded-lg text-center bg-white dark:bg-gray-700 hover:border-purple-500 transition transform hover:scale-[1.01]">
            <label className="block font-semibold text-gray-800 dark:text-white mb-2">
              Upload Development Screenshot
            </label>
            <input
              type="file"
              onChange={onPickImage2}
              accept="image/jpeg,image/png,image/webp"
              className={`${fileInputBase} ${
                hasActivePlan ? fileInputStyleActive : fileInputStyleInactive
              }`}
            />
            {prev2 && (
              <img src={prev2} alt="Preview" className="rounded shadow h-40 object-contain w-full mt-2" />
            )}
          </div>
        </div>

        <div className="mt-10 flex items-center gap-4 flex-wrap">
          <button
            onClick={handleCompare}
            // IMPORTANT: plan-based disable only (plus loading/images)
            disabled={!hasActivePlan || loading || !image1 || !image2}
            className={`bg-purple-800 hover:bg-purple-900 text-white px-6 py-3 rounded-lg font-semibold shadow transition ${
              !hasActivePlan || loading || !image1 || !image2 ? 'opacity-60 cursor-not-allowed' : ''
            }`}
          >
            {loading ? 'Comparing...' : 'Start Comparison'}
          </button>

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
            <h2 className="text-xl font-bold mb-4 text-purple-800 dark:text-purple-300">
              Visual Bug Report
            </h2>
            <ul className="text-sm mb-4">
              <li>
                <strong>File 1:</strong> {fileMeta.fileName1}
              </li>
              <li>
                <strong>File 2:</strong> {fileMeta.fileName2}
              </li>
              <li>
                <strong>Timestamp:</strong> {fileMeta.timestamp}
              </li>
            </ul>
            <div className="prose dark:prose-invert max-w-none text-sm">
              <ReactMarkdown>{comparisonResult}</ReactMarkdown>
            </div>
            <ExportPDF result={comparisonResult} />
          </div>
        )}
      </div>

      {/* Generic Modal (existing) */}
      <div
        className={`fixed inset-0 z-[100] transition-opacity duration-200 ${
          modal.open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={closeModal}
        aria-hidden={!modal.open}
      >
        <div className="absolute inset-0 bg-black/40" />
        <div className="absolute inset-0 flex items-center justify-center p-4">
          <div
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            className={`w-full max-w-md rounded-xl bg-white dark:bg-gray-900 shadow-2xl border border-gray-200 dark:border-gray-800 p-5 transform transition-all duration-200 ${
              modal.open ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-2'
            }`}
          >
            <div className="flex items-start justify-between mb-3">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{modal.title}</h3>
              <button
                onClick={closeModal}
                aria-label="Close"
                className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
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

      {/* NEW: Custom Daily Limit Modal */}
      <div
        className={`fixed inset-0 z-[110] ${
          limitModalOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        } transition-opacity`}
        onClick={() => setLimitModalOpen(false)}
        aria-hidden={!limitModalOpen}
      >
        <div className="absolute inset-0 bg-black/50" />
        <div className="absolute inset-0 flex items-center justify-center p-4">
          <div
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            className={`w-full max-w-lg rounded-2xl bg-white dark:bg-gray-900 shadow-2xl border border-purple-200 dark:border-purple-900 p-6 transform transition-all ${
              limitModalOpen ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-2'
            }`}
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="h-10 w-10 rounded-full bg-purple-100 dark:bg-purple-800 flex items-center justify-center">
                ⚠️
              </div>
              <h3 className="text-xl font-bold text-purple-800 dark:text-purple-300">
                Daily limit reached
              </h3>
            </div>

            <p className="text-sm text-gray-700 dark:text-gray-300 mb-4">
              You’ve used all comparisons for today on the <strong>{planName || '—'}</strong> plan.
            </p>

            <div className="mb-4">
              <div className="h-2 w-full rounded bg-gray-200 dark:bg-gray-800 overflow-hidden">
                <div
                  className="h-full bg-purple-600 dark:bg-purple-500 transition-all"
                  style={{ width: `${usedToday?.pct ?? 100}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">
                Used {usedToday?.used ?? (effectiveLimit ?? 0)} of {effectiveLimit ?? '—'} today • Resets at {resetAt}
              </p>
            </div>

            <ul className="list-disc pl-5 text-sm text-gray-700 dark:text-gray-300 space-y-1 mb-5">
              <li>Try again tomorrow when the counter resets.</li>
              <li>Need more runs today? Upgrade your plan for a higher daily limit.</li>
              <li>Tip: Batch related screens into a single session to save runs.</li>
            </ul>

            <div className="flex flex-wrap gap-3 justify-end">
              <button
                onClick={() => setLimitModalOpen(false)}
                className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                OK
              </button>
              <button
                onClick={goToCustomerPortal}
                className="px-4 py-2 rounded-lg bg-purple-700 hover:bg-purple-800 text-white font-semibold shadow"
              >
                Upgrade plan
              </button>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{``}</style>
    </div>
  );
}
