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
import { Toaster, toast as notify } from 'sonner';

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

  // plan/limits UI (display only; server is source of truth)
  const [planName, setPlanName] = useState(null);
  const [dailyLimit, setDailyLimit] = useState(null);
  const [remaining, setRemaining] = useState(null);

  const router = useRouter();

  // Auth guard (no immediate redirect inside the callback)
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      if (u) {
        setUser(u);
        try {
          const db = getFirestore();
          const snap = await getDoc(doc(db, 'users', u.uid));
          const d = snap.exists() ? snap.data() : {};
          const rawPlan = String(d?.activePlan || d?.plan || d?.tier || '').toLowerCase();
          const max = PLAN_LIMITS[rawPlan] ?? 0;
          setPlanName(rawPlan || null);
          setDailyLimit(max);
          setRemaining(max);
        } catch {
          setPlanName(null);
          setDailyLimit(null);
          setRemaining(null);
        }
      } else {
        setUser(null);
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
      if (justSignedUp) {
        // skip redirect to /login once; wait for user to hydrate
        return;
      }
      router.replace('/login');
    } else {
      // user is present → cleanup the flag if set
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
      notify.error('Sign out failed. Please try again.');
    }
  };

  function showFriendlyError({ status, code, msg }) {
    const m = String(msg || '').toLowerCase();

    if (status === 401 && /invalid|expired|token|unauthorized/.test(m)) {
      notify.error('Your session expired. Please sign in again.', {
        action: { label: 'Sign in', onClick: () => router.push('/login') },
      });
      return;
    }

    if (code === 'NO_PLAN' || /no active subscription|buy a plan|no active plan/.test(m)) {
      notify.error("You don't have an active subscription.", {
        description: 'Choose a plan to run comparisons.',
      });
      setRemaining(0);
      return;
    }

    if (status === 429 || code === 'LIMIT_EXCEEDED' || /daily limit/.test(m)) {
      notify.error('Daily limit reached for your plan.', {
        description: 'Try again tomorrow for more comparisons.',
      });
      setRemaining(0);
      return;
    }

    if (status === 400) {
      if (/both images are required/i.test(m)) {
        notify.error('Two images are required.', {
          description: 'Please upload the design and the development screenshot.',
        });
        return;
      }
      if (/only jpg|png|webp/i.test(m)) {
        notify.error('Unsupported image format.', {
          description: 'Use JPG, PNG, or WEBP files.',
        });
        return;
      }
    }

    if (/failed to fetch|network/.test(m)) {
      notify.error('Network issue. Please check your connection and try again.');
      return;
    }

    notify.error('We couldn’t complete the comparison.', {
      description: 'Please try again in a minute.',
    });
  }

  const handleCompare = async () => {
    if (!image1 || !image2) {
      notify.info('Please upload both images before comparing.');
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
      notify.success('Done! Your visual QA report is ready.');

      setRemaining((prev) => (typeof prev === 'number' ? Math.max(prev - 1, 0) : prev));
    } catch (error) {
      console.error('Comparison failed:', error);
    } finally {
      setLoading(false);
    }
  };

  // ---- SUBSCRIPTION-BASED UI STATE ----
  const hasActivePlan = typeof dailyLimit === 'number' && dailyLimit > 0;

  // File input button styling (purple if active plan; unchanged soft purple otherwise)
  const fileInputBase =
    "w-full cursor-pointer file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold";
  const fileInputStyleActive =
    "file:bg-purple-600 file:text-white hover:file:bg-purple-700";
  const fileInputStyleInactive =
    "file:bg-purple-100 file:text-purple-900 hover:file:bg-purple-200";

  const renderPreview = (file) =>
    file ? (
      <img
        src={URL.createObjectURL(file)}
        alt="Preview"
        className="rounded shadow h-40 object-contain w-full mt-2"
      />
    ) : null;

  if (!user) {
    return (
      <>
        <Toaster richColors position="top-center" closeButton />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-white text-gray-900 dark:bg-gray-900 dark:text-white font-sans">
      <Toaster richColors position="top-center" closeButton />
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
          {planName ? ` (plan: ${planName})` : ''}
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
          <div className="border-2 border-dashed border-purple-300 p-6 rounded-lg text-center bg.white dark:bg-gray-700 hover:border-purple-500 transition transform hover:scale-[1.01]">
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

          {!hasActivePlan && (
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
    </div>
  );
}
