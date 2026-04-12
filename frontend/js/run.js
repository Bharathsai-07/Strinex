/**
 * run.js — Basic Leaflet Map Initialization
 * Optimized for future GPS tracking and red polyline route drawing.
 *
 * Depends on: utils.js (fmt, toast) — loaded before this file.
 */

// ── State ────────────────────────────────────────────────────────────────────
let map, polyline, userMarker;
let summaryMap, summaryPolyline;
let routeCoords = [];
let running = false;
let clockTimer = null;
let elapsed = 0;
let mapInited = false;
let watchId = null;

/** Default map center coordinates */
const DEFAULT_POS = [20.5937, 78.9629]; // Centre of India
const RUN_HISTORY_STORAGE_KEY = 'strinex_run_history';
const RUN_META_KEY = 'strinex_run_meta';

// ── Map initialisation ───────────────────────────────────────────────────────

function _createOsmLayer() {
    return L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
    });
}

function _attachMapTiles(targetMap, mapStylePath = 'streets-v2') {
    const mapKey = (window.STRINEX_CONFIG || {}).MAPTILER_API_KEY;
    const useMapTiler = mapKey && !mapKey.includes('PASTE_YOUR_MAPTILER_KEY_HERE');

    if (!useMapTiler) {
        return _createOsmLayer().addTo(targetMap);
    }

    const mapTilerUrl = `https://api.maptiler.com/maps/${mapStylePath}/256/{z}/{x}/{y}.png?key=${mapKey}`;
    const mapTilerLayer = L.tileLayer(mapTilerUrl, { maxZoom: 19 });

    // If MapTiler key/quota/network fails, auto-fallback to OSM instead of black tiles.
    mapTilerLayer.on('tileerror', () => {
        if (!targetMap.hasLayer(mapTilerLayer)) return;
        targetMap.removeLayer(mapTilerLayer);
        _createOsmLayer().addTo(targetMap);
        console.warn('[run.js] MapTiler tiles failed, switched to OpenStreetMap fallback.');
    });

    return mapTilerLayer.addTo(targetMap);
}

/** Called once by router.js the first time the run page is shown. */
function initMap() {
    if (mapInited) {
        if (map) {
            setTimeout(() => map.invalidateSize(), 80);
        }
        return;
    }
    mapInited = true;

    // Render any saved run history cards
    renderRunHistory();

    // Initialize basic map with default coordinates and zoom level 13
    map = L.map('map', { zoomControl: true }).setView(DEFAULT_POS, 13);

    _attachMapTiles(map, 'streets-v2');

    // Prepare red polyline for future GPS route drawing
    polyline = L.polyline([], {
        color: '#ff2d2d',
        weight: 5,
        opacity: 0.9,
        lineJoin: 'round',
        lineCap: 'round',
    }).addTo(map);

    _setGpsStatus('searching', 'Locating you...');
    _maybeShowSecureContextWarning();

    if (!navigator.geolocation) {
        _showGeoError('Browser does not support Geolocation.');
        return;
    }

    navigator.geolocation.getCurrentPosition(
        pos => {
            const { latitude: lat, longitude: lng, accuracy } = pos.coords;
            map.setView([lat, lng], 15);
            _placeUserMarker([lat, lng]);
            _setGpsStatus('active', `Ready. GPS accuracy: ±${Math.round(accuracy)}m`);
        },
        err => {
            console.warn('[run.js] Initial Geolocation error:', err.message);
            _showGeoError(_geoErrMsg(err));
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );

    // Ensure tiles render correctly after layout settles.
    setTimeout(() => {
        if (map) map.invalidateSize();
    }, 140);
}

// Expose map init globally for router.js
window.initMap = initMap;

// ── Run control ──────────────────────────────────────────────────────────────

function toggleRun() { running ? stopRun() : startRun(); }

function getLiveRunSnapshot() {
    const dist = _calcDist(routeCoords);
    const pacePerKm = dist > 0 && elapsed > 0 ? (elapsed / 60) / dist : 0;

    return {
        distance: `${dist.toFixed(2)} km`,
        distanceRaw: dist,
        duration: fmt(elapsed),
        durationRaw: elapsed,
        pace: pacePerKm > 0
            ? `${Math.floor(pacePerKm)}:${Math.round((pacePerKm % 1) * 60).toString().padStart(2, '0')} min/km`
            : '--:-- min/km',
        paceRaw: pacePerKm,
        calories: null,
        timestamp: new Date().toLocaleString(),
        gpsPoints: routeCoords.length,
    };
}

function openRunCoach(runData) {
    if (typeof openChatbot !== 'function') return;
    const snapshot = runData || getLiveRunSnapshot();
    if (typeof showPage === 'function') {
        showPage('chatbot');
    }
    setTimeout(() => openChatbot(snapshot), 0);
}

function startRun() {
    if (!navigator.geolocation) {
        _showGeoError('Geolocation is not supported by your browser.');
        return;
    }

    // Let the browser handle the security context warning natively
    // We remove the strict window.location check to allow LAN testing with IP address.

    // Prevent duplicate sessions
    if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
    }

    // Hide previous summary
    const summaryEl = document.getElementById('run-summary');
    if (summaryEl) summaryEl.style.display = 'none';

    running = true;
    elapsed = 0;
    routeCoords = [];
    polyline.setLatLngs([]);
    _incrementRunStarts();
    updateDashboardStats();

    _setGpsStatus('searching', 'Acquiring GPS signal...');
    _setRunBtn('STOP RUN', 'run-ctrl-btn stop');

    // Clock
    clockTimer = setInterval(() => {
        elapsed++;
        document.getElementById('live-time').textContent = fmt(elapsed);
    }, 1000);

    // Start continuous tracking
    watchId = navigator.geolocation.watchPosition(
        (pos) => {
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            const accuracy = pos.coords.accuracy;

            // Filter out wildly inaccurate initial fixes (150m threshold for mobile GPS)
            if (accuracy > 150 && routeCoords.length === 0) {
                _setGpsStatus('searching', `Improving accuracy... ±${Math.round(accuracy)}m`);
                return;
            }

            const coord = [lat, lng];
            routeCoords.push(coord);
            console.log(`[GPS] New position: ${lat}, ${lng} (Accuracy: ${Math.round(accuracy)}m)`);

            // Update polyline, user marker, and pan map
            polyline.addLatLng(coord);
            _placeUserMarker(coord);
            map.panTo(coord, { animate: true, duration: 0.5 });

            // Calculate and display distance, pace, and speed
            const dist = _calcDist(routeCoords);
            document.getElementById('live-dist').innerHTML = `${dist.toFixed(2)} <span style="font-size:1rem;color:var(--muted)">km</span>`;
            const speedKmh = elapsed > 0 && dist > 0 ? dist / (elapsed / 3600) : 0;
            const pacePerKm = dist > 0 && elapsed > 0 ? (elapsed / 60) / dist : 0; // min/km
            document.getElementById('live-pace').textContent = pacePerKm > 0 ? `${Math.floor(pacePerKm)}:${Math.round((pacePerKm % 1) * 60).toString().padStart(2, '0')}` : '--:--';
            document.getElementById('live-speed').innerHTML = speedKmh > 0 ? `${speedKmh.toFixed(1)} <span style="font-size:0.65rem;color:var(--muted)">km/h</span>` : '0.0 <span style="font-size:0.65rem;color:var(--muted)">km/h</span>';
            const coordEl = document.getElementById('coord-count');
            if (coordEl) coordEl.textContent = `Route: ${routeCoords.length} GPS points logged`;

            _setGpsStatus('tracking', `GPS live · ±${Math.round(accuracy)}m`);
        },
        (err) => {
            console.warn('[run.js] Geolocation error:', err.message);
            _showGeoError(_geoErrMsg(err));
            stopRun();
        },
        {
            enableHighAccuracy: true,
            maximumAge: 0,
            timeout: 10000,
        }
    );
}

function stopRun() {
    running = false;
    clearInterval(clockTimer);

    if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
    }

    _setGpsStatus('active', '✓ Run stopped');
    _setRunBtn('START NEW RUN', 'run-ctrl-btn start');

    if (elapsed > 0) {
        toast(`Run complete! Route saved. 🎉`, 'success', 5000);

        // Populate summary overlay
        const summaryEl = document.getElementById('run-summary');
        if (summaryEl) {
            const dist = _calcDist(routeCoords);
            const durationStr = fmt(elapsed);
            const pacePerKm = dist > 0 && elapsed > 0 ? (elapsed / 60) / dist : 0;
            const paceStr = pacePerKm > 0
                ? `${Math.floor(pacePerKm)}:${Math.round((pacePerKm % 1) * 60).toString().padStart(2, '0')}`
                : '--:--';

            const dEl = document.getElementById('summary-dist');
            const tEl = document.getElementById('summary-time');
            const pEl = document.getElementById('summary-pace');
            const tsEl = document.getElementById('summary-timestamp');
            const cEl = document.getElementById('summary-calories');
            const eEl = document.getElementById('summary-elev');

            if (dEl) dEl.textContent = `${dist.toFixed(2)} km`;
            if (tEl) tEl.textContent = durationStr;
            if (pEl) pEl.textContent = `${paceStr} min/km`;

            // Human-readable completion timestamp
            if (tsEl) {
                const now = new Date();
                const datePart = now.toLocaleDateString(undefined, {
                    month: 'short',
                    day: '2-digit',
                    year: 'numeric',
                });
                const timePart = now.toLocaleTimeString(undefined, {
                    hour: '2-digit',
                    minute: '2-digit',
                });
                tsEl.textContent = `${datePart} · ${timePart}`;
            }

            // Optional: very simple calorie and elevation estimates (placeholder)
            if (cEl) {
                const cals = dist > 0 ? Math.round(dist * 70) : 0; // ~70 kcal per km baseline
                cEl.textContent = cals > 0 ? `${cals} kcal` : '—';
            }
            if (eEl) {
                eEl.textContent = '—';
            }

            _showRunSummaryOverlay();

            // Save run to history (localStorage)
            _saveRunToHistory({
                id: Date.now(),
                distance: `${dist.toFixed(2)} km`,
                distanceRaw: dist,
                duration: durationStr,
                durationRaw: elapsed,
                pace: `${paceStr} min/km`,
                paceRaw: pacePerKm,
                calories: dist > 0 ? `${Math.round(dist * 70)} kcal` : null,
                timestamp: tsEl ? tsEl.textContent : new Date().toLocaleString(),
                endedAtIso: new Date().toISOString(),
                endedAtMs: Date.now(),
                gpsPoints: routeCoords.length,
                routeCoordinates: routeCoords,
            });
        }
    }
    setTimeout(() => _setGpsStatus('', 'GPS idle'), 4000);
}

// ── Private helpers ───────────────────────────────────────────────────────────

function _placeUserMarker([lat, lng]) {
    if (userMarker) {
        userMarker.setLatLng([lat, lng]);
    } else {
        userMarker = L.circleMarker([lat, lng], {
            radius: 8, fillColor: '#3b82f6', color: '#fff', weight: 2, fillOpacity: 1,
        }).addTo(map).bindPopup('<b style="font-family:Syne,sans-serif">You are here</b>');
    }
}

function _calcDist(coords) {
    if (!coords || coords.length < 2) return 0;
    let dist = 0;
    for (let i = 1; i < coords.length; i++) {
        dist += _haversine(coords[i - 1], coords[i]);
    }
    return dist;
}

function _haversine([lat1, lon1], [lat2, lon2]) {
    const R = 6371; // km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function _showGeoError(msg) {
    const note = document.getElementById('gps-note');
    if (note) { note.className = 'gps-error'; note.innerHTML = '<b>Error:</b> ' + msg; }
    _setGpsStatus('', 'GPS error');
    if (typeof toast === 'function') toast(msg, 'error');
}

function _geoErrMsg(err) {
    switch (err.code) {
        case 1: return 'Location access denied. Please allow Geolocation in your browser settings.';
        case 2: return 'Position unavailable. Check your GPS or network connection.';
        case 3: return 'GPS timed out. Try moving to an open area.';
        default: return 'Unknown geolocation error.';
    }
}

function _setGpsStatus(dotClass, label) {
    const dot = document.getElementById('gps-dot');
    const lbl = document.getElementById('gps-label');
    if (dot) dot.className = 'gps-dot' + (dotClass ? ' ' + dotClass : '');
    if (lbl) lbl.textContent = label;
}

function _setRunBtn(text, className) {
    const btn = document.getElementById('run-btn');
    if (btn) { btn.textContent = text; btn.className = className; }
}

// Initialise the static Leaflet map inside the summary overlay
function _ensureSummaryMap() {
    if (summaryMap) return;
    const container = document.getElementById('run-summary-map');
    if (!container) return;

    summaryMap = L.map('run-summary-map', {
        zoomControl: false,
        attributionControl: false,
        dragging: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        boxZoom: false,
        keyboard: false,
        tap: false,
    }).setView(DEFAULT_POS, 13);

    _attachMapTiles(summaryMap, 'darkmatter');

    summaryPolyline = L.polyline([], {
        color: '#ff2d2d',
        weight: 6,
        opacity: 0.95,
        lineJoin: 'round',
        lineCap: 'round',
    }).addTo(summaryMap);
}

function _showRunSummaryOverlay() {
    if (!routeCoords || routeCoords.length < 1) return;
    const summaryEl = document.getElementById('run-summary');
    if (!summaryEl) return;

    _ensureSummaryMap();
    if (!summaryMap || !summaryPolyline) return;

    summaryPolyline.setLatLngs(routeCoords);
    const bounds = summaryPolyline.getBounds();

    summaryEl.style.display = 'flex';

    setTimeout(() => {
        try {
            if (bounds && bounds.isValid()) {
                summaryMap.fitBounds(bounds, { padding: [32, 32] });
            } else {
                summaryMap.setView(routeCoords[0], 15);
            }
            summaryMap.invalidateSize();
        } catch (e) {
            console.warn('[run.js] Failed to render summary map:', e);
        }
    }, 0);
}

function closeRunSummary() {
    const summaryEl = document.getElementById('run-summary');
    if (summaryEl) summaryEl.style.display = 'none';
}

/** Show a note if not in secure context (HTTPS) - geolocation may fail on mobile. */
function _maybeShowSecureContextWarning() {
    const secure = window.isSecureContext || location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    if (secure) return;
    const note = document.getElementById('gps-note');
    if (note) {
        note.className = 'gps-prompt gps-warning';
        note.innerHTML = '⚠️ <b>GPS may not work on mobile:</b> Use <b>HTTPS</b> (e.g. ngrok or deploy) — browsers block geolocation on plain HTTP.';
    }
}

// ── Run History + Dashboard Analytics (localStorage) ─────────────────

function _getActiveUserId() {
    return window.__clerkUser?.id || 'guest';
}

function _getRunMeta() {
    try {
        return JSON.parse(localStorage.getItem(RUN_META_KEY) || '{}');
    } catch {
        return {};
    }
}

function _setRunMeta(meta) {
    localStorage.setItem(RUN_META_KEY, JSON.stringify(meta));
}

function _incrementRunStarts() {
    const meta = _getRunMeta();
    const userId = _getActiveUserId();
    const current = meta[userId] || { startsCount: 0 };
    current.startsCount = (current.startsCount || 0) + 1;
    meta[userId] = current;
    _setRunMeta(meta);
}

function _getRunStartsCount() {
    const meta = _getRunMeta();
    const userId = _getActiveUserId();
    return meta[userId]?.startsCount || 0;
}

function _getRunHistory() {
    try {
        return JSON.parse(localStorage.getItem(RUN_HISTORY_STORAGE_KEY) || '[]');
    } catch { return []; }
}

function _isRunOwnedByUser(run, userId = _getActiveUserId()) {
    if (!run || typeof run !== 'object') return false;
    if (run.userId) return run.userId === userId;
    // Legacy runs without userId belong only to guest mode.
    return userId === 'guest';
}

function _getCurrentUserRunHistory() {
    return _getRunHistory().filter(run => _isRunOwnedByUser(run));
}

function _emitActivityUpdate(type = 'runs-updated') {
    window.dispatchEvent(new CustomEvent('strinex:activity-updated', {
        detail: {
            type,
            at: Date.now(),
        },
    }));
}

async function _getCurrentUserRunsForDisplay() {
    if (window.__clerkUser && typeof loadCurrentUserRuns === 'function') {
        try {
            const backendRuns = await loadCurrentUserRuns();
            if (Array.isArray(backendRuns)) {
                return backendRuns;
            }
        } catch (error) {
            console.warn('[run.js] Falling back to local run cache:', error);
        }
    }

    return _getCurrentUserRunHistory();
}

async function _saveRunToHistory(runData) {
    const user = window.__clerkUser;
    const userId = user?.id || 'guest';
    const normalized = {
        ...runData,
        userId,
        userName: user?.fullName || user?.firstName || 'Runner',
        endedAtMs: runData.endedAtMs || runData.id || Date.now(),
        endedAtIso: runData.endedAtIso || new Date(runData.endedAtMs || Date.now()).toISOString(),
    };

    try {
        if (window.__clerkUser && typeof saveUserRun === 'function') {
            await saveUserRun({
                    userName: user?.fullName || user?.firstName || 'Runner',
                    distance: runData.distanceRaw || parseFloat(String(runData.distance || '').replace(/[^\d.]/g, '')) || 0,
                    duration: runData.durationRaw || 0,
                    pace: runData.paceRaw || 0,
                    routeCoordinates: Array.isArray(runData.routeCoordinates)
                        ? runData.routeCoordinates.map((coord) => ({ lat: coord[0], lng: coord[1] }))
                        : [],
                    timestamp: runData.endedAtIso || new Date().toISOString(),
            });
        }
    } catch (error) {
        console.warn('[run.js] Backend save failed, storing locally:', error);
    }

    const history = _getRunHistory();
    history.unshift(normalized); // newest first
    const mine = history.filter(run => _isRunOwnedByUser(run, userId));
    const others = history.filter(run => !_isRunOwnedByUser(run, userId));

    // Keep max 50 runs per user so one account does not trim another account's history.
    if (mine.length > 50) mine.length = 50;

    localStorage.setItem(RUN_HISTORY_STORAGE_KEY, JSON.stringify([...mine, ...others]));
    renderRunHistory();
    updateDashboardStats();
    if (typeof renderLeaderboard === 'function') {
        renderLeaderboard();
    }
    _emitActivityUpdate('run-logged');
    if (typeof updateProfileStats === 'function') {
        updateProfileStats({ notifyUnlocks: true });
    }
}

async function renderRunHistory() {
    const container = document.getElementById('run-history-cards');
    const emptyEl = document.getElementById('run-history-empty');
    const clearBtn = document.getElementById('clear-history-btn');
    if (!container) return;

    const history = await _getCurrentUserRunsForDisplay();

    // Toggle empty state
    if (emptyEl) emptyEl.style.display = history.length === 0 ? 'flex' : 'none';
    if (clearBtn) clearBtn.style.display = history.length === 0 ? 'none' : 'inline-flex';

    // Remove existing cards (keep the empty-state div)
    container.querySelectorAll('.rh-card').forEach(c => c.remove());

    history.forEach((run, idx) => {
        const card = document.createElement('div');
        card.className = 'rh-card';
        card.innerHTML = `
            <div class="rh-card-top">
                <div class="rh-date">${run.timestamp || '—'}</div>
                <button class="rh-delete" onclick="deleteRun(${run.id})" title="Delete run">✕</button>
            </div>
            <div class="rh-stats">
                <div class="rh-stat">
                    <div class="rh-stat-label">Distance</div>
                    <div class="rh-stat-value rh-highlight">${run.distance}</div>
                </div>
                <div class="rh-stat">
                    <div class="rh-stat-label">Duration</div>
                    <div class="rh-stat-value">${run.duration}</div>
                </div>
                <div class="rh-stat">
                    <div class="rh-stat-label">Pace</div>
                    <div class="rh-stat-value">${run.pace}</div>
                </div>
                <div class="rh-stat">
                    <div class="rh-stat-label">Calories</div>
                    <div class="rh-stat-value">${run.calories || '—'}</div>
                </div>
            </div>
            <div class="rh-stat-label" style="margin-top:4px;font-size:0.6rem;">${run.gpsPoints || 0} GPS points</div>
            <button class="rh-ai-btn" onclick='openRunCoach(${JSON.stringify(run).replace(/'/g, "&#39;")})'>
                🤖 Ask AI Coach
            </button>
        `;
        container.appendChild(card);
    });
}

function clearRunHistory() {
    if (!confirm('Clear all run history?')) return;
    (async () => {
        try {
            if (window.__clerkUser && typeof clearUserRuns === 'function') {
                await clearUserRuns();
            }
        } catch (error) {
            console.warn('[run.js] Backend clear failed, clearing local cache only:', error);
        }

        const remaining = _getRunHistory().filter(run => !_isRunOwnedByUser(run));
        localStorage.setItem(RUN_HISTORY_STORAGE_KEY, JSON.stringify(remaining));
        await renderRunHistory();
        updateDashboardStats();
        if (typeof renderLeaderboard === 'function') {
            renderLeaderboard();
        }
        _emitActivityUpdate('run-history-cleared');
        if (typeof updateProfileStats === 'function') {
            updateProfileStats({ notifyUnlocks: false });
        }
        if (typeof toast === 'function') toast('Run history cleared', 'info');
    })();
}

function deleteRun(runId) {
    (async () => {
        try {
            if (window.__clerkUser && typeof deleteUserRun === 'function') {
                await deleteUserRun(runId);
            }
        } catch (error) {
            console.warn('[run.js] Backend delete failed, deleting local cache only:', error);
        }

        let history = _getRunHistory();
        history = history.filter(r => !(String(r.id) === String(runId) && _isRunOwnedByUser(r)));
        localStorage.setItem(RUN_HISTORY_STORAGE_KEY, JSON.stringify(history));
        await renderRunHistory();
        updateDashboardStats();
        if (typeof renderLeaderboard === 'function') {
            renderLeaderboard();
        }
        _emitActivityUpdate('run-deleted');
        if (typeof updateProfileStats === 'function') {
            updateProfileStats({ notifyUnlocks: false });
        }
    })();
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

function _startOfWeekSunday(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - d.getDay());
    return d;
}

function _dateKeyLocal(ms) {
    const d = new Date(ms);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function _formatPaceFromSecondsPerKm(secPerKm) {
    if (!Number.isFinite(secPerKm) || secPerKm <= 0) return '--:--';
    const m = Math.floor(secPerKm / 60);
    const s = Math.round(secPerKm % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
}

function _relativeDateLabel(ms) {
    const date = new Date(ms);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(date);
    target.setHours(0, 0, 0, 0);
    const diffDays = Math.round((today.getTime() - target.getTime()) / 86400000);

    if (diffDays <= 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;

    return date.toLocaleDateString(undefined, { month: 'short', day: '2-digit' });
}

function _calculateCurrentStreak(dayDistanceMap, minDailyKm = 1) {
    let streak = 0;
    const cursor = new Date();
    cursor.setHours(0, 0, 0, 0);

    while (true) {
        const key = _dateKeyLocal(cursor.getTime());
        if ((dayDistanceMap[key] || 0) >= minDailyKm) {
            streak += 1;
            cursor.setDate(cursor.getDate() - 1);
            continue;
        }

        // Any missed day below minDailyKm breaks streak immediately.
        break;
    }

    return streak;
}

async function updateDashboardStats() {
    const weekKmEl = document.getElementById('dash-week-km');
    const weekDeltaEl = document.getElementById('dash-week-delta');
    const streakDaysEl = document.getElementById('dash-streak-days');
    const streakGoalEl = document.getElementById('dash-streak-goal');
    const avgPaceEl = document.getElementById('dash-avg-pace');
    const avgPaceNoteEl = document.getElementById('dash-avg-pace-note');
    const totalRunsEl = document.getElementById('dash-total-runs');
    const totalRunsNoteEl = document.getElementById('dash-total-runs-note');
    const weekBarsEl = document.getElementById('dash-week-bars');
    const recentRunsEl = document.getElementById('dash-recent-runs');

    if (!weekKmEl || !weekDeltaEl || !streakDaysEl || !streakGoalEl || !avgPaceEl || !avgPaceNoteEl || !totalRunsEl || !totalRunsNoteEl || !weekBarsEl || !recentRunsEl) {
        return;
    }

    const sourceRuns = await _getCurrentUserRunsForDisplay();
    const runs = sourceRuns
        .map(run => ({
            ...run,
            ts: _runTimestampMs(run),
            dist: _runDistanceKm(run),
            durationSec: _runDurationSec(run),
        }))
        .filter(run => run.ts > 0)
        .sort((a, b) => b.ts - a.ts);

    const now = new Date();
    const weekStart = _startOfWeekSunday(now);
    const nextSunday = new Date(weekStart);
    nextSunday.setDate(nextSunday.getDate() + 7);

    const prevWeekStart = new Date(weekStart);
    prevWeekStart.setDate(prevWeekStart.getDate() - 7);

    const weekRuns = runs.filter(run => run.ts >= weekStart.getTime() && run.ts < nextSunday.getTime());
    const prevWeekRuns = runs.filter(run => run.ts >= prevWeekStart.getTime() && run.ts < weekStart.getTime());

    const weekDistance = weekRuns.reduce((sum, run) => sum + run.dist, 0);
    const prevWeekDistance = prevWeekRuns.reduce((sum, run) => sum + run.dist, 0);
    const weekDuration = weekRuns.reduce((sum, run) => sum + run.durationSec, 0);
    const weeklyAvgPace = weekDistance > 0 ? (weekDuration / weekDistance) : 0;

    weekKmEl.innerHTML = `${weekDistance.toFixed(2)}<span class="s-unit">km</span>`;
    const weekDelta = weekDistance - prevWeekDistance;
    if (prevWeekDistance > 0) {
        weekDeltaEl.textContent = `${weekDelta >= 0 ? '↑' : '↓'} ${weekDelta >= 0 ? '+' : ''}${weekDelta.toFixed(2)}km vs last week`;
    } else {
        weekDeltaEl.textContent = weekDistance > 0 ? 'First active week in your data' : 'No runs yet this week';
    }

    avgPaceEl.innerHTML = `${_formatPaceFromSecondsPerKm(weeklyAvgPace)}<span class="s-unit">/km</span>`;
    avgPaceNoteEl.textContent = weekRuns.length > 0
        ? `Based on ${weekRuns.length} run${weekRuns.length === 1 ? '' : 's'} this week`
        : 'Run this week to calculate average pace';

    const dayTotals = Array.from({ length: 7 }, () => 0);
    weekRuns.forEach(run => {
        const d = new Date(run.ts);
        const idx = d.getDay();
        dayTotals[idx] += run.dist;
    });

    const maxDayKm = Math.max(...dayTotals, 0.1);
    weekBarsEl.innerHTML = dayTotals.map((km, idx) => {
        const h = Math.max(5, (km / maxDayKm) * 100);
        const todayCls = idx === now.getDay() ? ' today' : '';
        const labels = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
        return `
            <div class="bar-wrap">
              <div class="bar${todayCls}" style="height:${h.toFixed(1)}%" title="${km.toFixed(2)} km"></div>
              <div class="bar-day">${labels[idx]}</div>
            </div>
        `;
    }).join('');

    const dayDistanceMap = {};
    runs.forEach(run => {
        const key = _dateKeyLocal(run.ts);
        dayDistanceMap[key] = (dayDistanceMap[key] || 0) + run.dist;
    });

    const streak = _calculateCurrentStreak(dayDistanceMap, 1);

    const todayKm = dayDistanceMap[_dateKeyLocal(now.getTime())] || 0;
    const kmAway = Math.max(0, 1 - todayKm);
    streakDaysEl.innerHTML = `🔥 ${streak}<span class="s-unit">days</span>`;
    streakGoalEl.textContent = kmAway > 0
        ? `You are ${kmAway.toFixed(2)} km away to get the streak today`
        : 'Streak goal complete today (1.00 km reached)';

    // Keep total runs account-specific by counting only this user's completed runs.
    const totalRuns = runs.length;
    totalRunsEl.textContent = String(totalRuns);
    totalRunsNoteEl.textContent = totalRuns > 0
        ? 'Based on your completed runs'
        : 'Complete a run to begin tracking totals';

    const recent = runs.slice(0, 4);
    if (recent.length === 0) {
        recentRunsEl.innerHTML = `
            <li class="run-item">
              <div>
                <div class="ri-dist">No runs yet</div>
                <div class="ri-date">Start your first tracked run</div>
              </div>
              <div class="run-pace">--:--/km</div>
            </li>
        `;
    } else {
        recentRunsEl.innerHTML = recent.map((run) => {
            const pace = run.dist > 0 ? _formatPaceFromSecondsPerKm(run.durationSec / run.dist) : '--:--';
            return `
                <li class="run-item">
                  <div>
                    <div class="ri-dist">${run.dist.toFixed(2)} km</div>
                    <div class="ri-date">${_relativeDateLabel(run.ts)} · ${fmt(run.durationSec)}</div>
                  </div>
                  <div class="run-pace">${pace}/km</div>
                </li>
            `;
        }).join('');
    }
}

window.addEventListener('DOMContentLoaded', () => {
    updateDashboardStats();
});
