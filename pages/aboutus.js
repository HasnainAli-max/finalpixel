// import Head from "next/head";
// import { useEffect, useState } from "react";
// import { onAuthStateChanged, signOut } from "firebase/auth";
// import { auth } from "@/lib/firebase/config";
// import Navbar from "@/components/Navbar";

// export default function AboutUs() {
//   const [user, setUser] = useState(null);

//   // Keep Navbar behavior consistent with Utility/Accounts
//   useEffect(() => {
//     const unsub = onAuthStateChanged(auth, (u) => setUser(u || null));
//     return () => unsub();
//   }, []);

//   const handleSignOut = async () => {
//     try {
//       await signOut(auth);
//     } catch (e) {
//       console.error("Sign out failed:", e);
//     }
//   };

//   return (
//     <>
//       <Head>
//         <title>About Us – PixelProof</title>
//       </Head>

//       {/* Same Navbar as Utility page */}
//       <Navbar user={user} onSignOut={handleSignOut} />

//       <main className="min-h-screen bg-gradient-to-b from-[#f7f8ff] to-white dark:from-slate-950 dark:to-slate-900 text-slate-800 dark:text-slate-100">
//         {/* Hero */}
//         <section className="max-w-6xl mx-auto px-6 pt-12 pb-10 grid lg:grid-cols-2 gap-10 items-center">
//           <div>
//             <span className="inline-block text-xs tracking-wide uppercase font-semibold text-[#6c2bd9] bg-violet-100/70 dark:bg-violet-900/30 dark:text-violet-300 px-2.5 py-1 rounded-full">
//               About PixelProof
//             </span>
//             <h1 className="mt-4 text-3xl sm:text-4xl lg:text-5xl font-extrabold leading-tight">
//               Design QA, automated — <span className="text-[#6c2bd9]">so you ship faster</span>
//             </h1>
//             <p className="mt-4 text-slate-600 dark:text-slate-300 text-base sm:text-lg">
//               PixelProof compares your source designs against live builds to catch visual bugs
//               before they reach your clients. Consistency, accuracy, and speed — in one simple workflow.
//             </p>
//           </div>

//           {/* Decorative / Illustration block */}
//           <div className="relative">
//             <div className="absolute inset-0 -z-10 blur-3xl opacity-60 bg-gradient-to-tr from-[#6c2bd9] via-fuchsia-500 to-cyan-400 rounded-3xl"></div>
//             <div className="rounded-2xl ring-1 ring-black/5 dark:ring-white/10 bg-white/80 dark:bg-slate-800/60 p-6 backdrop-blur">
//               <div className="grid grid-cols-3 gap-3">
//                 {[...Array(9)].map((_, i) => (
//                   <div
//                     key={i}
//                     className="aspect-[4/3] rounded-xl bg-gradient-to-br from-violet-100 to-white dark:from-slate-700 dark:to-slate-800 ring-1 ring-black/5 dark:ring-white/10"
//                   />
//                 ))}
//               </div>
//               <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">
//                 Smart diffing highlights spacing, color, and layout mismatches across breakpoints.
//               </p>
//             </div>
//           </div>
//         </section>

//         {/* Mission & What we do */}
//         <section className="max-w-6xl mx-auto px-6 grid lg:grid-cols-3 gap-6 pb-12">
//           <div className="lg:col-span-1 rounded-2xl p-6 bg-white dark:bg-slate-800 ring-1 ring-black/5 dark:ring-white/10">
//             <h2 className="text-xl font-semibold">Our mission</h2>
//             <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
//               Eliminate manual visual QA. We help teams automate design review so they can focus on
//               solving user problems — not pixel hunting.
//             </p>
//           </div>

//           <div className="lg:col-span-2 grid sm:grid-cols-2 gap-6">
//             {[
//               {
//                 title: "Visual diffs",
//                 desc: "Compare design vs build, highlight variances, and get actionable notes.",
//                 emoji: "🖼️",
//               },
//               {
//                 title: "Layout checks",
//                 desc: "Detect spacing, alignment, and responsive layout inconsistencies.",
//                 emoji: "📐",
//               },
//               {
//                 title: "Color & type",
//                 desc: "Verify color tokens, typography scales, and component states.",
//                 emoji: "🎨",
//               },
//               {
//                 title: "Shareable reports",
//                 desc: "Generate tidy reports your team can discuss and close quickly.",
//                 emoji: "📄",
//               },
//             ].map((f) => (
//               <div
//                 key={f.title}
//                 className="rounded-2xl p-5 bg-white dark:bg-slate-800 ring-1 ring-black/5 dark:ring-white/10"
//               >
//                 <div className="text-2xl">{f.emoji}</div>
//                 <h3 className="mt-2 font-semibold">{f.title}</h3>
//                 <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{f.desc}</p>
//               </div>
//             ))}
//           </div>
//         </section>

//         {/* Why teams choose us (stats) */}
//         <section className="max-w-6xl mx-auto px-6 pb-12">
//           <div className="rounded-2xl p-6 bg-white dark:bg-slate-800 ring-1 ring-black/5 dark:ring-white/10">
//             <h2 className="text-xl font-semibold">Why teams choose PixelProof</h2>
//             <div className="mt-6 grid sm:grid-cols-3 gap-4">
//               {[
//                 { k: "60%+", v: "Faster QA cycles" },
//                 { k: "95%", v: "Fewer visual regressions" },
//                 { k: "24/7", v: "Automated checks on demand" },
//               ].map((s) => (
//                 <div
//                   key={s.v}
//                   className="rounded-xl p-4 bg-slate-50 dark:bg-slate-700/60 ring-1 ring-black/5 dark:ring-white/10"
//                 >
//                   <div className="text-2xl font-extrabold text-[#6c2bd9]">{s.k}</div>
//                   <div className="text-sm text-slate-600 dark:text-slate-300">{s.v}</div>
//                 </div>
//               ))}
//             </div>
//           </div>
//         </section>

//         {/* Team */}
//         <section className="max-w-6xl mx-auto px-6 pb-12">
//           <h2 className="text-xl font-semibold mb-4">The team</h2>
//           <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
//             {[
//               {
//                 name: "Hasnain Ali",
//                 role: "Founder & Product",
//                 img: "https://images.unsplash.com/photo-1527980965255-d3b416303d12?q=80&w=200&auto=format&fit=crop",
//               },
//               {
//                 name: "Asad Ali",
//                 role: "Engineering",
//                 img: "https://images.unsplash.com/photo-1502685104226-ee32379fefbe?q=80&w=200&auto=format&fit=crop",
//               },
//               {
//                 name: "Sara Khan",
//                 role: "Design",
//                 img: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?q=80&w=200&auto=format&fit=crop",
//               },
//             ].map((m) => (
//               <div
//                 key={m.name}
//                 className="rounded-2xl p-6 bg-white dark:bg-slate-800 ring-1 ring-black/5 dark:ring-white/10"
//               >
//                 <div className="h-16 w-16 rounded-full overflow-hidden ring-1 ring-black/5 dark:ring-white/10">
//                   <img src={m.img} alt={m.name} className="h-full w-full object-cover" />
//                 </div>
//                 <div className="mt-3 font-semibold">{m.name}</div>
//                 <div className="text-sm text-slate-600 dark:text-slate-300">{m.role}</div>
//               </div>
//             ))}
//           </div>
//         </section>

//         {/* CTA */}
//         <section className="max-w-6xl mx-auto px-6 pb-20">
//           <div className="rounded-2xl p-6 bg-gradient-to-r from-[#6c2bd9] to-fuchsia-600 text-white flex flex-col md:flex-row md:items-center md:justify-between gap-4">
//             <div>
//               <h3 className="text-xl font-bold">Ready to try PixelProof?</h3>
//               <p className="text-sm opacity-90">Run your first visual QA report in minutes.</p>
//             </div>
//             <div className="flex gap-3">
//               <a
//                 href="/utility"
//                 className="inline-flex h-11 items-center px-5 rounded-xl bg-white/10 hover:bg-white/20 transition"
//               >
//                 Get started
//               </a>
//               <a
//                 href="/plans"
//                 className="inline-flex h-11 items-center px-5 rounded-xl bg-black/20 hover:bg-black/30 transition"
//               >
//                 View plans
//               </a>
//             </div>
//           </div>
//         </section>
//       </main>
//     </>
//   );
// }





import Head from "next/head";
import { useEffect, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "@/lib/firebase/config";
import Navbar from "@/components/Navbar";

export default function AboutUs() {
  const [user, setUser] = useState(null);

  // Keep Navbar behavior consistent with Utility/Accounts
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

  return (
    <>
      <Head>
        <title>About Us – PixelProof</title>
      </Head>

      {/* Same Navbar as Utility page */}
      <Navbar user={user} onSignOut={handleSignOut} />

      <main className="min-h-screen bg-gradient-to-b from-[#f7f8ff] to-white dark:from-slate-950 dark:to-slate-900 text-slate-800 dark:text-slate-100">
        <section className="max-w-3xl mx-auto px-6 py-20 md:py-28">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold leading-tight">
            About <span className="text-[#6c2bd9]">PixelProof</span>
          </h1>

          <p className="mt-4 sm:mt-5 text-base sm:text-lg md:text-xl text-slate-600 dark:text-slate-300">
            PixelProof helps teams automate visual QA by comparing source designs with live builds,
            highlighting layout, spacing, and color differences—so you can ship confident, consistent
            interfaces faster.
          </p>
        </section>
      </main>
    </>
  );
}
