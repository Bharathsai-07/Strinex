/**
 * utils.js — Shared math / formatting helpers (no DOM dependencies)
 */

/** Haversine great-circle distance between two [lat, lon] points → km */
function haversine([la1, lo1], [la2, lo2]) {
  const R = 6371;
  const dLa = (la2 - la1) * Math.PI / 180;
  const dLo = (lo2 - lo1) * Math.PI / 180;
  const a = Math.sin(dLa / 2) ** 2 +
    Math.cos(la1 * Math.PI / 180) *
    Math.cos(la2 * Math.PI / 180) *
    Math.sin(dLo / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Cumulative route distance in km from array of [lat, lon] points */
function calcDist(pts) {
  let d = 0;
  for (let i = 1; i < pts.length; i++) d += haversine(pts[i - 1], pts[i]);
  return d;
}

/** Format seconds → "MM:SS" */
function fmt(s) {
  const m = Math.floor(s / 60);
  return `${m.toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
}

/** Show a toast notification (success | error | info) */
function toast(message, type = 'info', durationMs = 3500) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => el.remove(), durationMs);
}

/** Get initials from a full name string */
function initials(name = '') {
  return name.trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?';
}
