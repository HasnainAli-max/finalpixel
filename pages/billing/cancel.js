// pages/billing/cancel.js
import Head from "next/head";
import Link from "next/link";

export default function Cancel() {
  return (
    <>
      <Head>
        <title>Checkout Canceled – PixelProof</title>
        <meta name="robots" content="noindex" />
      </Head>

      <main className="min-h-screen bg-gradient-to-b from-purple-900 via-purple-800 to-purple-700 text-white flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-md">
          {/* Card */}
          <div className="bg-white text-gray-900 rounded-2xl shadow-xl ring-1 ring-black/5 overflow-hidden">
            {/* Header ribbon */}
            <div className="bg-gradient-to-r from-rose-600 to-fuchsia-600 p-6 text-white">
              <div className="mx-auto h-12 w-12 rounded-full bg-white/20 grid place-items-center shadow">
                {/* X-circle icon */}
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-6 w-6"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9 9 0 100-18 9 9 0 000 18z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 9l-6 6m0-6l6 6" />
                </svg>
              </div>
              <h1 className="mt-4 text-2xl font-bold tracking-tight">Checkout canceled</h1>
              <p className="mt-1 text-sm text-white/90">
                No charge was made to your card.
              </p>
            </div>

            {/* Body */}
            <div className="p-6">
              <p className="text-sm text-gray-600">
                You can restart the checkout at any time. If this was unintentional,
                please try again or choose a different plan.
              </p>

              {/* Actions */}
              <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Link href="/">
                  <button className="w-full h-11 rounded-xl bg-purple-700 text-white font-medium shadow-sm hover:brightness-95 transition">
                    Return to plans
                  </button>
                </Link>

                {/* <Link href="/#pricing">
                  <button className="w-full h-11 rounded-xl border border-gray-300 text-gray-800 hover:bg-gray-50 transition">
                    View Pricing
                  </button>
                </Link> */}
              </div>

              {/* Help */}
              {/* <p className="mt-6 text-xs text-gray-500">
                Need help?{" "}
                <a
                  href="mailto:support@pixelproof.app"
                  className="text-purple-700 hover:underline"
                >
                  Contact support
                </a>
                .
              </p> */}
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
