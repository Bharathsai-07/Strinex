/**
 * router.js — Page routing and active nav-button state
 */

function requestRunMapInit(attempt = 0) {
    const init = window.initMap;
    if (typeof init === 'function') {
        init();
        return;
    }

    if (attempt < 10) {
        setTimeout(() => requestRunMapInit(attempt + 1), 120);
        return;
    }

    console.warn('[router] initMap is not available after retries. Ensure run.js is loaded.');
    if (typeof toast === 'function') {
        toast('Run map failed to initialize. Please refresh once.', 'error');
    }
}

/** Show a page and update nav active states. */
function showPage(id) {
    // Signed-in users: redirect landing → dashboard
    if (id === 'landing' && isSignedIn()) {
        id = 'dashboard';
    }

    // Protected pages require sign-in
    const protectedPages = ['dashboard', 'run', 'chatbot', 'leaderboard', 'profile'];
    if (protectedPages.includes(id) && !isSignedIn()) {
        toast('Please sign in to access this page.', 'info');
        openAuth();
        return;
    }

    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.page === id);
    });
    document.getElementById('page-' + id).classList.add('active');

    if (id === 'run') setTimeout(() => requestRunMapInit(), 60);
}

/** Returns true if a Clerk user is currently signed in. */
function isSignedIn() {
    return window.__clerkUser != null;
}
