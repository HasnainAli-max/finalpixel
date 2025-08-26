#!/usr/bin/env node
import { spawn } from "child_process";

const PORT = process.env.PORT || "3000";
const events =
  "checkout.session.completed,customer.subscription.created,customer.subscription.updated,customer.subscription.deleted";
const forwardUrl = `http://127.0.0.1:${PORT}/api/stripe/webhook`;

// 1) Start Stripe listen (dev-only)
const stripe = spawn(
  "stripe",
  ["listen", "--forward-to", forwardUrl, "--events", events],
  { stdio: ["ignore", "pipe", "pipe"] }
);

let secretSet = false;
let nextProc = null;

function startNext(secret) {
  if (nextProc) return;
  const env = { ...process.env, STRIPE_WEBHOOK_SECRET: secret }; // in-memory
  // 2) Start Next dev with the secret injected
  nextProc = spawn("next", ["dev", "-p", PORT], { stdio: "inherit", env });
  nextProc.on("exit", (code) => {
    stripe.kill();
    process.exit(code ?? 0);
  });
}

stripe.stdout.on("data", (chunk) => {
  const text = chunk.toString();
  process.stdout.write(`[stripe] ${text}`);
  if (!secretSet) {
    // extract whsec_...
    const m = text.match(/whsec_[A-Za-z0-9]+/);
    if (m) {
      secretSet = true;
      const secret = m[0];
      console.log(`[dev] Using STRIPE_WEBHOOK_SECRET=${secret.slice(0, 8)}… (in-memory)`);
      startNext(secret);
    }
  }
});

stripe.stderr.on("data", (chunk) =>
  process.stderr.write(`[stripe:err] ${chunk.toString()}`)
);

// Clean exit
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    if (nextProc) nextProc.kill(sig);
    stripe.kill(sig);
    process.exit(0);
  });
}
