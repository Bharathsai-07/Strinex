/**
 * run.js — Basic Leaflet Map Initialization
 * Optimized for future GPS tracking and red polyline route drawing.
 *
 * Depends on: utils.js (fmt, toast) — loaded before this file.
 */

// ── State ────────────────────────────────────────────────────────────────────
let map, polyline, userMarker;
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

    // Initialize basic map with default coordinates and zoom level 13
    map = L.map('map', { zoomControl: true }).setView(DEFAULT_POS, 13);

    const mapKey = (window.STRINEX_CONFIG || {}).MAPTILER_API_KEY;
    const useMapTiler = mapKey && !mapKey.includes('PASTE_YOUR_MAPTILER_KEY_HERE');

    // Add tile layer
    if (useMapTiler) {
        L.tileLayer(`https://api.maptiler.com/maps/streets-v2/256/{z}/{x}/{y}.png?key=${mapKey}`, {
            maxZoom: 19,
            attribution: '© <a href="https://www.maptiler.com/copyright/">MapTiler</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        }).addTo(map);
    } else {
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
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
