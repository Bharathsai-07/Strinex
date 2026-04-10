/**
 * config.js — Strinex frontend configuration
 *
 * ▶  Paste your Clerk Publishable Key below.
 *    Get it from: https://dashboard.clerk.com → Your App → API Keys
 *    It starts with  pk_test_  (development) or  pk_live_  (production).
 *
 * ⚠  This file is intentionally NOT committed — add it to .gitignore.
 *    NEVER use your Clerk SECRET key (sk_...) here.
 */
const isProdHost = location.hostname !== 'localhost' && location.hostname !== '127.0.0.1';

window.STRINEX_CONFIG = {
    CLERK_PUBLISHABLE_KEY: 'pk_test_Y2l2aWwtY2FpbWFuLTIxLmNsZXJrLmFjY291bnRzLmRldiQ',
    MAPTILER_API_KEY: 'MbtlpWEiezLDPteE1AAF',
    BACKEND_API_URL: isProdHost ? 'https://your-backend-url.onrender.com' : 'http://localhost:5000',
};
