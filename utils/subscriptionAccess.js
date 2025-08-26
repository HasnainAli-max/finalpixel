// // utils/subscriptionAccess.js
// export function userHasPlanAccess(userDoc) {
//   if (!userDoc) return false;
//   const status = userDoc.subscriptionStatus;
//   const hasPlan = Boolean(userDoc.activePlan) && Boolean(userDoc.priceId);
//   // allow only paying/trialing users
//   return hasPlan && (status === 'active' || status === 'trialing');
// }
