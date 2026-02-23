/**
 * auth.js — Clerk authentication via hosted pages (redirect flow)
 *
 * Strategy:
 *  1. Read the publishable key from config.js (window.STRINEX_CONFIG)
 *  2. Dynamically inject the Clerk CDN script with `data-clerk-publishable-key`
 *     set to the REAL key — this prevents any "missing key" auto-init error
 *  3. Wait for script load, then call clerk.load() to restore any existing session
 *  4. For sign-in / sign-up → clerk.redirectToSignIn() / redirectToSignUp()
 *     Clerk handles the entire UI — we never build a custom form
 */

window.__clerkUser = null;
let _clerkInstance = null;

// ── Bootstrap ────────────────────────────────────────────────────────────────

async function initClerk() {
    const key = (window.STRINEX_CONFIG || {}).CLERK_PUBLISHABLE_KEY || '';

    if (!key || key.includes('PASTE_YOUR_KEY')) {
        console.warn('[Strinex] No Clerk key in config.js — demo mode active.');
        _hideLoading();
        _setNavSignedOut();
        return;
    }

    try {
        // Inject Clerk CDN dynamically — key is set BEFORE the script runs,
        // so Clerk never throws "missing publishableKey" during auto-init.
        await _loadClerkScript(key);

        // window.Clerk is now the fully initialised Clerk instance
        _clerkInstance = window.Clerk;
        await _clerkInstance.load();

        _clerkInstance.addListener(({ user }) => {
            window.__clerkUser = user;
            user ? _onSignedIn(user) : _onSignedOut();
        });

        if (_clerkInstance.user) {
            window.__clerkUser = _clerkInstance.user;
            _onSignedIn(_clerkInstance.user);
        } else {
            _setNavSignedOut();
        }
    } catch (err) {
        console.error('[Strinex] Clerk error:', err);
        toast('Auth unavailable — running in demo mode.', 'info');
        _setNavSignedOut();
    }

    _hideLoading();
}

/**
 * Inject the Clerk CDN <script> at runtime with data-clerk-publishable-key
 * already set. Returns a Promise that resolves once the script has loaded.
 */
function _loadClerkScript(key) {
    return new Promise((resolve, reject) => {
        // Avoid double-injection
        if (document.getElementById('clerk-cdn')) { resolve(); return; }

        const s = document.createElement('script');
        s.id = 'clerk-cdn';
        s.src = 'https://cdn.jsdelivr.net/npm/@clerk/clerk-js@latest/dist/clerk.browser.js';
        s.setAttribute('data-clerk-publishable-key', key);
        s.crossOrigin = 'anonymous';
        s.onload = resolve;
        s.onerror = () => reject(new Error('Failed to load Clerk CDN'));
        document.head.appendChild(s);
    });
}

// ── Public auth actions ───────────────────────────────────────────────────────

/** Redirect to Clerk's hosted sign-in page. */
function openAuth(mode = 'login') {
    if (_clerkInstance) {
        mode === 'signup'
            ? _clerkInstance.redirectToSignUp()
            : _clerkInstance.redirectToSignIn();
    } else {
        // Demo mode — simulate sign-in without Clerk
        _demoSignIn();
    }
}

/** Sign out via Clerk and return to landing page. */
async function signOut() {
    if (_clerkInstance) {
        await _clerkInstance.signOut();
    } else {
        window.__clerkUser = null;
        _onSignedOut();
        showPage('landing');
    }
}

/** Demo sign-in (no Clerk key configured). */
function _demoSignIn() {
    window.__clerkUser = {
        fullName: 'Demo User',
        firstName: 'Demo',
        primaryEmailAddress: { emailAddress: 'demo@strinex.app' },
        id: 'demo_user',
    };
    _onSignedIn(window.__clerkUser);
    showPage('dashboard');
}

// ── Nav / UI updates ──────────────────────────────────────────────────────────

function _onSignedIn(user) {
    const name = user.fullName || user.firstName
        || user.primaryEmailAddress?.emailAddress || 'Runner';

    const pill = document.getElementById('nav-pill');
    const ubtn = document.getElementById('clerk-user-btn');

    pill.style.display = 'none';
    ubtn.style.display = 'flex';

    // Hide Home, show protected links
    const homeBtn = document.getElementById('nav-home');
    if (homeBtn) homeBtn.style.display = 'none';
    document.querySelectorAll('.protected-link').forEach(el => el.style.display = 'block');

    // Switch to dashboard (remove landing page for signed-in users)
    showPage('dashboard');

    if (window.Clerk) {
        window.Clerk.mountUserButton(ubtn, {
            appearance: {
                elements: {
                    userButtonAvatarBox: "width: 26px; height: 26px;"
                },
                layout: { showOptionalName: true }
            }
        });
    } else {
        ubtn.innerHTML = `<div class="clerk-pill"><div class="avatar"><img src="${user.imageUrl || 'https://ui-avatars.com/api/?name=Demo&background=ff4b4b&color=fff'}" style="width:100%;height:100%;border-radius:50%"></div><div class="clerk-name">${name}</div></div>`;
    }

    // Profile page
    const pAvatar = document.getElementById('profile-avatar-text');
    if (pAvatar) {
        pAvatar.innerHTML = `<img src="${user.imageUrl || 'https://ui-avatars.com/api/?name=Demo&background=ff4b4b&color=fff'}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
        pAvatar.style.background = 'transparent';
    }

    document.getElementById('profile-name').textContent = name;
    document.getElementById('profile-handle').textContent = '@' + name.replace(/\s+/g, '.').toLowerCase() + ' · Strinex';
    document.getElementById('profile-clerk-id').textContent = '✓ Verified via Clerk · ' + (user.id || '');

    // Dashboard greeting
    const sub = document.getElementById('dash-sub');
    if (sub) sub.textContent = `Welcome back, ${name.split(' ')[0]} · Strinex`;

    toast(`Welcome back, ${name.split(' ')[0]}! 👋`, 'success');
}

function _onSignedOut() {
    window.__clerkUser = null;
    _setNavSignedOut();
    showPage('landing');
}

function _setNavSignedOut() {
    const pill = document.getElementById('nav-pill');
    const ubtn = document.getElementById('clerk-user-btn');
    if (pill) pill.style.display = 'flex';
    if (ubtn) ubtn.style.display = 'none';
    if (ubtn && window.Clerk) window.Clerk.unmountUserButton(ubtn);

    // Show Home, hide protected links
    const homeBtn = document.getElementById('nav-home');
    if (homeBtn) homeBtn.style.display = 'block';
    document.querySelectorAll('.protected-link').forEach(el => el.style.display = 'none');

    if (!pill) return;
    pill.classList.add('signed-out');
    pill.onclick = () => openAuth('login');

    const navAvatar = document.getElementById('nav-avatar');
    navAvatar.style.background = '';
    navAvatar.innerHTML = '?';

    document.getElementById('nav-username').textContent = 'Sign In';
    document.getElementById('nav-username').style.display = 'block';
}

function _hideLoading() {
    const el = document.getElementById('clerk-loading');
    if (el) el.style.display = 'none';
}
