// utils/stripePlans.js

// Map Stripe Price IDs → your internal plan slugs.
// Be sure these envs are set in Vercel: STRIPE_PRICE_BASIC, STRIPE_PRICE_PRO, STRIPE_PRICE_ELITE
export const PLAN_BY_PRICE = Object.freeze({
  [process.env.STRIPE_PRICE_BASIC]: 'basic',
  [process.env.STRIPE_PRICE_PRO]: 'pro',
  [process.env.STRIPE_PRICE_ELITE]: 'elite',
});

// Optional helper
export function planFromPriceId(priceId) {
  return PLAN_BY_PRICE[priceId] || null;
}
