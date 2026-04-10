/**
 * api.js — Backend integration helpers for Strinex.
 */

const STRINEX_API_BASE = (window.STRINEX_CONFIG || {}).BACKEND_API_URL || 'http://localhost:5000';

async function _getClerkToken() {
    const clerk = window.Clerk;
    const session = clerk?.session;

    if (session && typeof session.getToken === 'function') {
        return await session.getToken();
    }

    return null;
}

async function backendFetch(path, options = {}) {
    const token = await _getClerkToken();
    const headers = new Headers(options.headers || {});

    if (token) {
        headers.set('Authorization', `Bearer ${token}`);
    }

    if (options.body && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
    }

    const response = await fetch(`${STRINEX_API_BASE}${path}`, {
        ...options,
        credentials: options.credentials || 'include',
        headers,
    });

    if (!response.ok) {
        const errorText = await response.text();
        const error = new Error(errorText || `Request failed with status ${response.status}`);
        error.status = response.status;
        error.path = path;
        throw error;
    }

    return response.json();
}

async function checkBackendHealth(timeoutMs = 5000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(`${STRINEX_API_BASE}/health`, {
            method: 'GET',
            credentials: 'include',
            signal: controller.signal,
        });
        if (!response.ok) return false;
        const data = await response.json().catch(() => ({}));
        return data?.status === 'ok';
    } catch (error) {
        return false;
    } finally {
        clearTimeout(timeoutId);
    }
}

async function fetchUserRuns(limit = 200) {
    return backendFetch(`/runs?limit=${limit}`);
}

async function saveUserRun(payload) {
    return backendFetch('/runs', {
        method: 'POST',
        body: JSON.stringify(payload),
    });
}

async function deleteUserRun(runId) {
    return backendFetch(`/runs/${encodeURIComponent(runId)}`, {
        method: 'DELETE',
    });
}

async function clearUserRuns() {
    return backendFetch('/runs', {
        method: 'DELETE',
    });
}

async function fetchLeaderboardData(period = 'total', limit = 20) {
    return backendFetch(`/leaderboard?period=${encodeURIComponent(period)}&limit=${limit}`);
}

function _runTimestampMs(run) {
    if (typeof run.endedAtMs === 'number' && Number.isFinite(run.endedAtMs)) return run.endedAtMs;
    if (typeof run.timestamp === 'number' && Number.isFinite(run.timestamp)) return run.timestamp;
    const parsed = Date.parse(run.timestamp || run.endedAtIso || '');
    return Number.isNaN(parsed) ? 0 : parsed;
}

function _runDistanceKm(run) {
    if (typeof run.distanceRaw === 'number' && Number.isFinite(run.distanceRaw)) return run.distanceRaw;
    if (typeof run.distance === 'number' && Number.isFinite(run.distance)) return run.distance;
    const parsed = parseFloat(String(run.distance || '').replace(/[^\d.]/g, ''));
    return Number.isNaN(parsed) ? 0 : parsed;
}

function _runDurationSec(run) {
    if (typeof run.durationRaw === 'number' && Number.isFinite(run.durationRaw)) return run.durationRaw;
    if (typeof run.duration === 'number' && Number.isFinite(run.duration)) return run.duration;
    const m = String(run.duration || '').match(/^(\d+):(\d{2})$/);
    if (!m) return 0;
    return (parseInt(m[1], 10) * 60) + parseInt(m[2], 10);
}

function _toFrontendRun(run) {
    const timestampMs = _runTimestampMs(run);
    const durationSec = _runDurationSec(run);
    const distanceKm = _runDistanceKm(run);
    const paceMinPerKm = typeof run.pace === 'number' ? run.pace : (distanceKm > 0 ? durationSec / 60 / distanceKm : 0);
    const paceMins = paceMinPerKm > 0 ? Math.floor(paceMinPerKm) : 0;
    const paceSecs = paceMinPerKm > 0 ? Math.round((paceMinPerKm % 1) * 60) : 0;

    return {
        id: run._id || run.id || timestampMs,
        userId: run.userId,
        distance: `${distanceKm.toFixed(2)} km`,
        distanceRaw: distanceKm,
        duration: typeof run.duration === 'string' ? run.duration : fmt(durationSec),
        durationRaw: durationSec,
        pace: paceMinPerKm > 0 ? `${paceMins}:${String(paceSecs).padStart(2, '0')} min/km` : '--:-- min/km',
        paceRaw: paceMinPerKm,
        timestamp: new Date(timestampMs).toLocaleString(),
        endedAtIso: new Date(timestampMs).toISOString(),
        endedAtMs: timestampMs,
        gpsPoints: Array.isArray(run.routeCoordinates) ? run.routeCoordinates.length : (run.gpsPoints || 0),
        routeCoordinates: run.routeCoordinates || [],
        calories: run.calories || null,
        userName: run.userName || 'Runner',
    };
}

async function loadCurrentUserRuns() {
    const result = await fetchUserRuns();
    return (result.runs || []).map(_toFrontendRun);
}

async function loadLeaderboardRows(period = 'total') {
    const result = await fetchLeaderboardData(period);
    return result.leaderboard || [];
}

function _dayKey(ms) {
    const d = new Date(ms);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function summarizeRuns(runs) {
    const sorted = [...runs]
        .map(run => ({
            ...run,
            ts: _runTimestampMs(run),
            dist: _runDistanceKm(run),
            durationSec: _runDurationSec(run),
        }))
        .filter(run => run.ts > 0)
        .sort((a, b) => b.ts - a.ts);

    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setHours(0, 0, 0, 0);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const nextWeekStart = new Date(weekStart);
    nextWeekStart.setDate(nextWeekStart.getDate() + 7);
    const prevWeekStart = new Date(weekStart);
    prevWeekStart.setDate(prevWeekStart.getDate() - 7);

    const weekRuns = sorted.filter(run => run.ts >= weekStart.getTime() && run.ts < nextWeekStart.getTime());
    const prevWeekRuns = sorted.filter(run => run.ts >= prevWeekStart.getTime() && run.ts < weekStart.getTime());

    const weekDistance = weekRuns.reduce((sum, run) => sum + run.dist, 0);
    const prevWeekDistance = prevWeekRuns.reduce((sum, run) => sum + run.dist, 0);
    const weekDuration = weekRuns.reduce((sum, run) => sum + run.durationSec, 0);
    const avgPace = weekDistance > 0 ? weekDuration / weekDistance : 0;

    const dayTotals = {};
    sorted.forEach(run => {
        const key = _dayKey(run.ts);
        dayTotals[key] = (dayTotals[key] || 0) + run.dist;
    });

    let streak = 0;
    const cursor = new Date();
    cursor.setHours(0, 0, 0, 0);
    while ((dayTotals[_dayKey(cursor.getTime())] || 0) >= 1) {
        streak += 1;
        cursor.setDate(cursor.getDate() - 1);
    }

    return {
        runs: sorted,
        weekDistance,
        prevWeekDistance,
        weekRuns,
        avgPace,
        streak,
        totalRuns: sorted.length,
    };
}
