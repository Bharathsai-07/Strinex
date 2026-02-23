/**
 * router.js — Page routing and active nav-button state
 */

const pages = ['landing', 'dashboard', 'run', 'leaderboard', 'profile'];

/** Show a page and update nav active states. */
function showPage(id) {
    // Signed-in users: redirect landing → dashboard
    if (id === 'landing' && isSignedIn()) {
        id = 'dashboard';
    }

    // Protected pages require sign-in
    const protectedPages = ['dashboard', 'leaderboard', 'profile'];
    if (protectedPages.includes(id) && !isSignedIn()) {
        toast('Please sign in to access this page.', 'info');
        openAuth();
        return;
    }

    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach((btn, i) => {
        btn.classList.toggle('active', pages[i] === id);
    });
    document.getElementById('page-' + id).classList.add('active');

    if (id === 'run') setTimeout(initMap, 60);
}

/** Returns true if a Clerk user is currently signed in. */
function isSignedIn() {
    return window.__clerkUser != null;
}
