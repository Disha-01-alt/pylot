// Quick check that your PayPal sandbox credentials authenticate (no money moves).
// Run:  node --env-file=.env scripts/check-paypal.mjs
import { token } from '../src/rails/paypalAuth.mjs';

try {
  const t = await token();
  console.log(`✅ PayPal sandbox auth OK (token length ${t.length}). Payouts + Invoicing are reachable.`);
} catch (e) {
  console.error('❌ PayPal auth failed:', e.message);
  console.error('   Check PAYPAL_CLIENT_ID / PAYPAL_SECRET in .env (sandbox app).');
  process.exit(1);
}
