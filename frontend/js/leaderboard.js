/**
 * leaderboard.js — Leaderboard data and table rendering
 */

const lbData = [
  { rank: 1, name: 'Arjun Sharma', handle: '@arjun_s', city: 'Hyderabad', dist: 89.4, streak: 14, pace: '5:12', col: '#ef4444' },
  { rank: 2, name: 'Priya Nair', handle: '@priya_n', city: 'Bangalore', dist: 77.2, streak: 21, pace: '5:28', col: '#3b82f6' },
  { rank: 3, name: 'Karan Mehta', handle: '@karan_m', city: 'Mumbai', dist: 65.8, streak: 9, pace: '5:35', col: '#22c55e' },
  { rank: 4, name: 'You', handle: '@you', city: 'Your City', dist: 60.1, streak: 7, pace: '5:38', col: '#ff2d2d', me: true },
  { rank: 5, name: 'Sneha Pillai', handle: '@sneha_p', city: 'Chennai', dist: 54.3, streak: 5, pace: '5:47', col: '#f59e0b' },
  { rank: 6, name: 'Ravi Kumar', handle: '@ravi_k', city: 'Pune', dist: 48.9, streak: 3, pace: '5:55', col: '#8b5cf6' },
  { rank: 7, name: 'Ananya Bose', handle: '@ananya_b', city: 'Kolkata', dist: 42.1, streak: 11, pace: '6:02', col: '#06b6d4' },
  { rank: 8, name: 'Dev Patel', handle: '@dev_p', city: 'Delhi', dist: 37.7, streak: 2, pace: '6:14', col: '#84cc16' },
];

function renderLeaderboard() {
  const body = document.getElementById('lb-body');
  if (!body) return;
  body.innerHTML = '';

  // Personalise "You" row with the signed-in user name
  const user = window.__clerkUser;
  const meEntry = lbData.find(u => u.me);
  if (meEntry && user) {
    meEntry.name = user.fullName || user.firstName || 'You';
    meEntry.handle = '@' + (meEntry.name).replace(/\s+/g, '.').toLowerCase();
  }

  lbData.forEach(u => {
    const medal = u.rank === 1 ? '🥇' : u.rank === 2 ? '🥈' : u.rank === 3 ? '🥉' : u.rank;
    const rankCls = u.rank <= 3 ? `rank-${u.rank}` : '';
    const streak = u.streak >= 7
      ? `<span class="badge fire">🔥 ${u.streak}d</span>`
      : `<span class="badge">${u.streak}d</span>`;

    body.innerHTML += `
      <tr class="${u.me ? 'me' : ''} ${rankCls}">
        <td><span class="rank-num">${medal}</span></td>
        <td>
          <div class="lb-user">
            <div class="lb-avatar" style="background:${u.col}22;border:1px solid ${u.col}44;color:${u.col}">
              ${u.name[0]}
            </div>
            <div>
              <div style="font-weight:500">
                ${u.name}
                ${u.me ? '<span style="font-size:0.68rem;color:var(--red)">(you)</span>' : ''}
              </div>
              <div style="font-family:DM Mono,monospace;font-size:0.65rem;color:var(--muted)">${u.handle}</div>
            </div>
          </div>
        </td>
        <td><span style="font-family:Syne,sans-serif;font-weight:700">${u.dist}</span> <span style="color:var(--muted);font-size:0.78rem">km</span></td>
        <td>${streak}</td>
      </tr>`;
  });
}

renderLeaderboard();
