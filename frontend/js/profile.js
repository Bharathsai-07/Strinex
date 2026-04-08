/**
 * profile.js — Profile page stats, leveling system, and dynamic achievements
 * Depends on: run.js (run history), auth.js (user context)
 */

const PROFILE_RUN_HISTORY_KEY = 'strinex_run_history';

function _isProfileRunOwnedByUser(run, userId) {
    if (!run || typeof run !== 'object') return false;
    if (run.userId) return run.userId === userId;
    return userId === 'guest';
}

async function _getAllUserRuns() {
    if (window.__clerkUser && typeof loadCurrentUserRuns === 'function') {
        try {
            const backendRuns = await loadCurrentUserRuns();
            if (Array.isArray(backendRuns)) {
                return backendRuns;
            }
        } catch (error) {
            console.warn('[profile] Falling back to local cache:', error);
        }
    }

    try {
        const all = JSON.parse(localStorage.getItem(PROFILE_RUN_HISTORY_KEY) || '[]');
        const userId = window.__clerkUser?.id || 'guest';
        return all.filter(run => _isProfileRunOwnedByUser(run, userId));
    } catch {
        return [];
    }
}

function _runTimestampMs(run) {
    if (typeof run.endedAtMs === 'number' && Number.isFinite(run.endedAtMs)) return run.endedAtMs;
    if (typeof run.id === 'number' && Number.isFinite(run.id)) return run.id;
    const parsed = Date.parse(run.endedAtIso || run.timestamp || '');
    return Number.isNaN(parsed) ? 0 : parsed;
}

function _runDistanceKm(run) {
    if (typeof run.distanceRaw === 'number' && Number.isFinite(run.distanceRaw)) return run.distanceRaw;
    const parsed = parseFloat(String(run.distance || '').replace(/[^\d.]/g, ''));
    return Number.isNaN(parsed) ? 0 : parsed;
}

function _runDurationSec(run) {
    if (typeof run.durationRaw === 'number' && Number.isFinite(run.durationRaw)) return run.durationRaw;
    const m = String(run.duration || '').match(/^(\d+):(\d{2})$/);
    if (!m) return 0;
    return (parseInt(m[1], 10) * 60) + parseInt(m[2], 10);
}

function _formatPaceFromSecondsPerKm(secPerKm) {
    if (!Number.isFinite(secPerKm) || secPerKm <= 0) return '--:--';
    const m = Math.floor(secPerKm / 60);
    const s = Math.round(secPerKm % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
}

function _dayKey(ms) {
    const d = new Date(ms);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function _weekStartSunday(baseDate = new Date()) {
    const d = new Date(baseDate);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - d.getDay());
    return d;
}

/**
 * Level system: XP earned from runs and results in progressive levels.
 * XP formula: 10 XP per completed run + 5 XP per km
 * Level thresholds increase non-linearly for bigger challenge.
 */
function _calculateXP(runs) {
    let xp = 0;
    runs.forEach(run => {
        xp += 10; // base XP per run
        xp += Math.floor(_runDistanceKm(run) * 5); // 5 XP per km
    });
    return xp;
}

function _levelThresholds() {
    // Progressive level thresholds: each level requires more XP
    // Level 1: 0-100 (100 XP to advance) - entry level
    // Level 2: 100-250 (150 XP to advance) - moderate
    // Level 3: 250-450 (200 XP to advance) - challenging
    // Level 4: 450-700 (250 XP to advance) - hard
    // Level 5: 700-1000 (300 XP to advance) - very hard
    // etc.
    const thresholds = [0];
    let current = 0;
    for (let i = 1; i <= 20; i++) {
        current += 100 + (i - 1) * 50; // 100, 150, 200, 250, ...
        thresholds.push(current);
    }
    return thresholds;
}

function _calculateLevel(xp) {
    const thresholds = _levelThresholds();
    for (let i = thresholds.length - 1; i >= 0; i--) {
        if (xp >= thresholds[i]) {
            return {
                level: i + 1,
                xp,
                xpForLevel: thresholds[i],
                xpForNext: i + 1 < thresholds.length ? thresholds[i + 1] : thresholds[i] + 400,
                progress: i + 1 < thresholds.length
                    ? ((xp - thresholds[i]) / (thresholds[i + 1] - thresholds[i])) * 100
                    : 100,
            };
        }
    }
    return { level: 1, xp: 0, xpForLevel: 0, xpForNext: 100, progress: (xp / 100) * 100 };
}

/**
 * Achievements definition with real unlock conditions
 */
function _getAchievements() {
    return [
        {
            id: 'first-run',
            icon: '🥇',
            name: 'First Run',
            sub: 'Completed first tracked run',
            check: (stats) => stats.totalRuns >= 1,
        },
        {
            id: 'ten-k-club',
            icon: '🔟',
            name: '10K Club',
            sub: 'First 10km in one session',
            check: (stats) => stats.maxSingleRunKm >= 10,
        },
        {
            id: 'week-warrior',
            icon: '🔥',
            name: 'Week Warrior',
            sub: '7-day streak maintained',
            check: (stats) => stats.bestStreak >= 7,
        },
        {
            id: 'century',
            icon: '🏃',
            name: 'Century',
            sub: '100km total distance',
            check: (stats) => stats.totalDistance >= 100,
        },
        {
            id: 'marathon-master',
            icon: '💨',
            name: 'Marathon Master',
            sub: 'Single run 21km+',
            check: (stats) => stats.maxSingleRunKm >= 21,
        },
        {
            id: 'ultra-runner',
            icon: '⚡',
            name: 'Ultra Runner',
            sub: 'Total 50km distance',
            check: (stats) => stats.totalDistance >= 50,
        },
        {
            id: 'speed-demon',
            icon: '🦅',
            name: 'Speed Demon',
            sub: 'Sub 4:30/km pace',
            check: (stats) => stats.bestPaceSec <= 270, // 270 sec = 4:30
        },
        {
            id: 'consistent-runner',
            icon: '🎯',
            name: 'Consistent Runner',
            sub: '10+ runs completed',
            check: (stats) => stats.totalRuns >= 10,
        },
        {
            id: 'globe-trotter',
            icon: '🌍',
            name: 'Globe Trotter',
            sub: '500km total distance',
            check: (stats) => stats.totalDistance >= 500,
        },
        {
            id: 'elite-pacer',
            icon: '⏱️',
            name: 'Elite Pacer',
            sub: 'Sub 4:00/km pace',
            check: (stats) => stats.bestPaceSec <= 240, // 240 sec = 4:00
        },
    ];
}

/**
 * Compute all profile stats from run history
 */
async function _computeProfileStats() {
    const runs = (await _getAllUserRuns())
        .map(run => ({
            ...run,
            ts: _runTimestampMs(run),
            dist: _runDistanceKm(run),
            durationSec: _runDurationSec(run),
        }))
        .filter(run => run.ts > 0)
        .sort((a, b) => b.ts - a.ts);

    const totalRuns = runs.length;
    const totalDistance = runs.reduce((sum, r) => sum + r.dist, 0);
    const maxSingleRunKm = runs.length > 0 ? Math.max(...runs.map(r => r.dist)) : 0;

    // Best pace (lowest seconds per km)
    let bestPaceSec = Infinity;
    runs.forEach(run => {
        if (run.dist > 0 && run.durationSec > 0) {
            const pace = run.durationSec / run.dist;
            bestPaceSec = Math.min(bestPaceSec, pace);
        }
    });
    bestPaceSec = bestPaceSec === Infinity ? 0 : bestPaceSec;

    // Best streak overall (compute from all historical days)
    const dayTotals = {};
    runs.forEach(run => {
        const key = _dayKey(run.ts);
        dayTotals[key] = (dayTotals[key] || 0) + run.dist;
    });

    let bestStreak = 0;
    Object.keys(dayTotals).sort().reverse().forEach(key => {
        if (dayTotals[key] >= 1) {
            let streak = 1;
            const d = new Date(key + 'T00:00:00');
            d.setDate(d.getDate() - 1);
            while (true) {
                const prevKey = _dayKey(d.getTime());
                if (dayTotals[prevKey] && dayTotals[prevKey] >= 1) {
                    streak++;
                    d.setDate(d.getDate() - 1);
                } else {
                    break;
                }
            }
            bestStreak = Math.max(bestStreak, streak);
        }
    });

    const xp = _calculateXP(runs);
    const levelInfo = _calculateLevel(xp);

    return {
        totalRuns,
        totalDistance,
        maxSingleRunKm,
        bestPaceSec,
        bestStreak,
        xp,
        levelInfo,
    };
}

async function updateProfileStats() {
    const levelEl = document.getElementById('profile-level');
    const xpTextEl = document.getElementById('profile-xp-text');
    const xpFillEl = document.getElementById('profile-xp-fill');
    const distEl = document.getElementById('profile-total-distance');
    const runsEl = document.getElementById('profile-total-runs');
    const streakEl = document.getElementById('profile-best-streak');
    const paceEl = document.getElementById('profile-best-pace');
    const achievementsGridEl = document.getElementById('profile-achievements-grid');

    if (!window.__clerkUser) {
        // Not signed in
        if (levelEl) levelEl.textContent = "LVL '0'";
        if (xpTextEl) xpTextEl.textContent = 'Sign in to track stats';
        if (xpFillEl) xpFillEl.style.width = '0%';
        if (distEl) distEl.innerHTML = '0<span class="s-unit">km</span>';
        if (runsEl) runsEl.textContent = '0';
        if (streakEl) streakEl.innerHTML = '🔥 0<span class="s-unit">days</span>';
        if (paceEl) paceEl.innerHTML = '--:--<span class="s-unit">/km</span>';
        if (achievementsGridEl) achievementsGridEl.innerHTML = '';
        return;
    }

    const stats = await _computeProfileStats();
    const { levelInfo } = stats;

    if (levelEl) levelEl.textContent = `LVL '${levelInfo.level}'`;
    if (xpTextEl) xpTextEl.textContent = `${Math.floor(stats.xp)} / ${Math.floor(levelInfo.xpForNext)} XP`;
    if (xpFillEl) xpFillEl.style.width = `${Math.min(levelInfo.progress, 100)}%`;

    if (distEl) distEl.innerHTML = `${stats.totalDistance.toFixed(1)}<span class="s-unit">km</span>`;
    if (runsEl) runsEl.textContent = String(stats.totalRuns);
    if (streakEl) streakEl.innerHTML = `🔥 ${stats.bestStreak}<span class="s-unit">days</span>`;
    if (paceEl) paceEl.innerHTML = `${_formatPaceFromSecondsPerKm(stats.bestPaceSec)}<span class="s-unit">/km</span>`;

    // Render achievements
    const achievements = _getAchievements();
    if (achievementsGridEl) {
        achievementsGridEl.innerHTML = achievements.map(ach => {
            const unlocked = ach.check(stats);
            const lockedCls = unlocked ? '' : ' locked';
            return `
                <div class="achievement${lockedCls}">
                    <div class="ach-icon">${ach.icon}</div>
                    <div>
                        <div class="ach-name">${ach.name}</div>
                        <div class="ach-sub">${ach.sub}</div>
                    </div>
                </div>
            `;
        }).join('');
    }
}

window.updateProfileStats = updateProfileStats;
window.addEventListener('DOMContentLoaded', updateProfileStats);
