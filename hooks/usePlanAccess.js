// "use client";
// import { useEffect, useState } from "react";
// import { onSnapshot, doc } from "firebase/firestore";
// import { db } from "@/lib/firebase/config";

// // ✅ Named export (curly braces se import hoga)
// export function usePlanAccess(uid) {
//   const [loading, setLoading] = useState(true);
//   const [userDoc, setUserDoc] = useState(null);

//   useEffect(() => {
//     if (!uid) {
//       setUserDoc(null);
//       setLoading(false);
//       return;
//     }
//     const ref = doc(db, "users", uid);
//     const unsub = onSnapshot(
//       ref,
//       (snap) => {
//         setUserDoc(snap.exists() ? snap.data() : null);
//         setLoading(false);
//       },
//       () => setLoading(false)
//     );
//     return unsub;
//   }, [uid]);

//   const status = userDoc?.subscriptionStatus;
//   const hasPlan = Boolean(userDoc?.activePlan) && Boolean(userDoc?.priceId);
//   const allowed = hasPlan && (status === "active" || status === "trialing");

//   return { loading, userDoc, allowed };
// }
