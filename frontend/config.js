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
window.STRINEX_CONFIG = {
    CLERK_PUBLISHABLE_KEY: 'pk_test_c2F2aW5nLXNwb25nZS05Mi5jbGVyay5hY2NvdW50cy5kZXYk',
    MAPTILER_API_KEY: 'MbtlpWEiezLDPteE1AAF',
    CHATBOT_API_KEY: 'AIzaSyANc1uywX7Ex-5uDKS-hlZna-ftHVeHm9M',
    CHATBOT_API_URL: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
};
