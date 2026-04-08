/**
 * leaderboard.js — Weekly leaderboard from real run history.
 * Source: localStorage run data created in run.js.
 */

const LEADERBOARD_RUN_HISTORY_KEY = 'strinex_run_history';

function _leaderboardHandleFromName(name) {
  return '@' + String(name || 'runner').replace(/\s+/g, '.').toLowerCase();
}

function _getAllRuns() {
  try {
    return JSON.parse(localStorage.getItem(LEADERBOARD_RUN_HISTORY_KEY) || '[]');
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

function _weekStartSunday(baseDate = new Date()) {
  const d = new Date(baseDate);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

function _dayKey(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function _stableColor(seed) {
  const palette = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6', '#06b6d4', '#84cc16', '#f97316', '#e11d48'];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = ((hash << 5) - hash) + seed.charCodeAt(i);
  return palette[Math.abs(hash) % palette.length];
}

function _computeWeeklyStreakDays(dayTotals, weekStartMs, nowMs) {
  let streak = 0;
  const cursor = new Date(nowMs);
  cursor.setHours(0, 0, 0, 0);
  while (cursor.getTime() >= weekStartMs) {
    const key = _dayKey(cursor.getTime());
    if ((dayTotals[key] || 0) >= 1) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
      continue;
    }
    break;
  }
  return streak;
}

function _buildLeaderboardRows() {
  const now = new Date();
  const weekStart = _weekStartSunday(now);
  const nextWeekStart = new Date(weekStart);
  nextWeekStart.setDate(nextWeekStart.getDate() + 7);

  const runs = _getAllRuns()
    .map(run => ({
      ...run,
      ts: _runTimestampMs(run),
      dist: _runDistanceKm(run),
    }))
    .filter(run => run.ts >= weekStart.getTime() && run.ts < nextWeekStart.getTime())
    .filter(run => run.userId && run.userId !== 'guest');

  const map = {};
  runs.forEach(run => {
    if (!map[run.userId]) {
      const name = run.userName || 'Runner';
      map[run.userId] = {
        userId: run.userId,
        name,
        handle: '@' + name.replace(/\s+/g, '.').toLowerCase(),
        dist: 0,
        dayTotals: {},
      };
    }
    map[run.userId].dist += run.dist;
    const k = _dayKey(run.ts);
    map[run.userId].dayTotals[k] = (map[run.userId].dayTotals[k] || 0) + run.dist;
  });

  const entries = Object.values(map).map(entry => ({
    ...entry,
    streak: _computeWeeklyStreakDays(entry.dayTotals, weekStart.getTime(), now.getTime()),
    col: _stableColor(entry.userId),
  }));

  entries.sort((a, b) => {
    if (b.dist !== a.dist) return b.dist - a.dist;
    if (b.streak !== a.streak) return b.streak - a.streak;
    return a.name.localeCompare(b.name);
  });

  return {
    entries: entries.map((e, idx) => ({ ...e, rank: idx + 1 })),
    weekStart,
    nextWeekStart,
  };
}

async function _getLeaderboardEntries() {
  if (window.__clerkUser && typeof loadLeaderboardRows === 'function') {
    try {
      const rows = await loadLeaderboardRows('weekly');
      if (Array.isArray(rows)) {
        return rows.map((row) => ({
          rank: row.rank,
          userId: row.userId,
          name: row.userName || 'Runner',
          handle: _leaderboardHandleFromName(row.userName || 'Runner'),
          dist: row.distance || 0,
          streak: row.currentStreak || 0,
          col: _stableColor(row.userId),
        }));
      }
    } catch (error) {
      console.warn('[leaderboard] Falling back to local leaderboard cache:', error);
    }
  }

  return _buildLeaderboardRows().entries.map((row) => ({
    ...row,
    name: row.name || 'Runner',
    handle: row.handle || _leaderboardHandleFromName(row.name || 'Runner'),
    streak: row.streak || 0,
  }));
}

async function renderLeaderboard() {
  const body = document.getElementById('lb-body');
  const weekNote = document.getElementById('lb-week-note');
  const posNote = document.getElementById('lb-position-note');
  if (!body) return;

  const entries = await _getLeaderboardEntries();
  const userId = window.__clerkUser?.id || null;

  if (weekNote) {
    const now = new Date();
    const weekStart = _weekStartSunday(now);
    const nextWeekStart = new Date(weekStart);
    nextWeekStart.setDate(nextWeekStart.getDate() + 7);
    const a = weekStart.toLocaleDateString(undefined, { month: 'short', day: '2-digit' });
    const b = new Date(nextWeekStart.getTime() - 1).toLocaleDateString(undefined, { month: 'short', day: '2-digit' });
    weekNote.textContent = `Weekly rankings (${a} - ${b}) · Auto reset every Sunday`;
  }

  if (entries.length === 0) {
    body.innerHTML = `
      <tr>
        <td colspan="4" style="padding:18px 12px;color:var(--muted);font-family:DM Mono,monospace;">No weekly run data yet. Complete a run to appear on the leaderboard.</td>
      </tr>
    `;
    if (posNote) posNote.textContent = userId
      ? 'You have no qualifying run data this week yet.'
      : 'Sign in to track your weekly rank.';
    return;
  }

  body.innerHTML = '';
  entries.forEach(u => {
    const me = userId && u.userId === userId;
    const medal = u.rank === 1 ? '🥇' : u.rank === 2 ? '🥈' : u.rank === 3 ? '🥉' : u.rank;
    const rankCls = u.rank <= 3 ? `rank-${u.rank}` : '';
    const streakHtml = u.streak >= 1
      ? `<span class="badge fire">🔥 ${u.streak}d</span>`
      : '<span class="badge">0d</span>';

    body.innerHTML += `
      <tr class="${me ? 'me' : ''} ${rankCls}">
        <td><span class="rank-num">${medal}</span></td>
        <td>
          <div class="lb-user">
            <div class="lb-avatar" style="background:${u.col}22;border:1px solid ${u.col}44;color:${u.col}">
              ${(u.name[0] || 'R').toUpperCase()}
            </div>
            <div>
              <div style="font-weight:500">
                ${u.name}
                ${me ? '<span style="font-size:0.68rem;color:var(--red)">(you)</span>' : ''}
              </div>
              <div style="font-family:DM Mono,monospace;font-size:0.65rem;color:var(--muted)">${u.handle}</div>
            </div>
          </div>
        </td>
        <td><span style="font-family:Syne,sans-serif;font-weight:700">${u.dist.toFixed(2)}</span> <span style="color:var(--muted);font-size:0.78rem">km</span></td>
        <td>${streakHtml}</td>
      </tr>`;
  });

  if (posNote) {
    if (!userId) {
      posNote.textContent = 'Sign in with Clerk to see your position.';
    } else {
      const myRow = entries.find(e => e.userId === userId);
      posNote.textContent = myRow
        ? `You are in position #${myRow.rank} out of ${entries.length} runners this week.`
        : `You are not ranked yet this week. Complete at least one run to join ${entries.length} runners.`;
    }
  }
}

window.renderLeaderboard = renderLeaderboard;
window.addEventListener('DOMContentLoaded', renderLeaderboard);
window.addEventListener('storage', (evt) => {
  if (evt.key === LEADERBOARD_RUN_HISTORY_KEY) renderLeaderboard();
});
