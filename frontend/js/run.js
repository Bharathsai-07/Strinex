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

// ── Map initialisation ───────────────────────────────────────────────────────

/** Called once by router.js the first time the run page is shown. */
function initMap() {
    if (mapInited) return;
    mapInited = true;

    // Render any saved run history cards
    renderRunHistory();

    // Initialize basic map with default coordinates and zoom level 13
    map = L.map('map', { zoomControl: true }).setView(DEFAULT_POS, 13);

    const mapKey = (window.STRINEX_CONFIG || {}).MAPTILER_API_KEY;
    const useMapTiler = mapKey && !mapKey.includes('PASTE_YOUR_MAPTILER_KEY_HERE');

    // Add tile layer
    if (useMapTiler) {
        L.tileLayer(`https://api.maptiler.com/maps/streets-v2/256/{z}/{x}/{y}.png?key=${mapKey}`, {
            maxZoom: 19,
            // attribution: '© <a href="https://www.maptiler.com/copyright/">MapTiler</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        }).addTo(map);
    } else {
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            // attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        }).addTo(map);
    }

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
}

// ── Run control ──────────────────────────────────────────────────────────────

function toggleRun() { running ? stopRun() : startRun(); }

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

            // Calculate and display distance, pace, speed, points
            const dist = _calcDist(routeCoords);
            document.getElementById('live-dist').innerHTML = `${dist.toFixed(2)} <span style="font-size:1rem;color:var(--muted)">km</span>`;
            const speedKmh = elapsed > 0 && dist > 0 ? dist / (elapsed / 3600) : 0;
            const pacePerKm = dist > 0 && elapsed > 0 ? (elapsed / 60) / dist : 0; // min/km
            document.getElementById('live-pace').textContent = pacePerKm > 0 ? `${Math.floor(pacePerKm)}:${Math.round((pacePerKm % 1) * 60).toString().padStart(2, '0')}` : '--:--';
            document.getElementById('live-speed').innerHTML = speedKmh > 0 ? `${speedKmh.toFixed(1)} <span style="font-size:0.65rem;color:var(--muted)">km/h</span>` : '0.0 <span style="font-size:0.65rem;color:var(--muted)">km/h</span>';
            document.getElementById('live-pts').textContent = routeCoords.length;
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
                calories: dist > 0 ? `${Math.round(dist * 70)} kcal` : null,
                timestamp: tsEl ? tsEl.textContent : new Date().toLocaleString(),
                gpsPoints: routeCoords.length,
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

    const mapKey = (window.STRINEX_CONFIG || {}).MAPTILER_API_KEY;
    const useMapTiler = mapKey && !mapKey.includes('PASTE_YOUR_MAPTILER_KEY_HERE');

    if (useMapTiler) {
        // Dark, high-contrast tiles for a photo-like summary
        L.tileLayer(`https://api.maptiler.com/maps/darkmatter/256/{z}/{x}/{y}.png?key=${mapKey}`, {
            maxZoom: 19,
        }).addTo(summaryMap);
    } else {
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
        }).addTo(summaryMap);
    }

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

// ── Run History (localStorage) ───────────────────────────────────────

const RUN_HISTORY_KEY = 'strinex_run_history';

function _getRunHistory() {
    try {
        return JSON.parse(localStorage.getItem(RUN_HISTORY_KEY) || '[]');
    } catch { return []; }
}

function _saveRunToHistory(runData) {
    const history = _getRunHistory();
    history.unshift(runData); // newest first
    // Keep max 50 runs
    if (history.length > 50) history.length = 50;
    localStorage.setItem(RUN_HISTORY_KEY, JSON.stringify(history));
    renderRunHistory();
}

function renderRunHistory() {
    const container = document.getElementById('run-history-cards');
    const emptyEl = document.getElementById('run-history-empty');
    const clearBtn = document.getElementById('clear-history-btn');
    if (!container) return;

    const history = _getRunHistory();

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
            <button class="rh-ai-btn" onclick='openChatbot(${JSON.stringify(run).replace(/'/g, "&#39;")})'>
                🤖 Ask AI Coach
            </button>
        `;
        container.appendChild(card);
    });
}

function clearRunHistory() {
    if (!confirm('Clear all run history?')) return;
    localStorage.removeItem(RUN_HISTORY_KEY);
    renderRunHistory();
    if (typeof toast === 'function') toast('Run history cleared', 'info');
}

function deleteRun(runId) {
    let history = _getRunHistory();
    history = history.filter(r => r.id !== runId);
    localStorage.setItem(RUN_HISTORY_KEY, JSON.stringify(history));
    renderRunHistory();
}
