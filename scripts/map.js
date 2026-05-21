// ── map.js ──
// Handles all Leaflet map logic, geocoding via Postcodes.io,
// and marker clustering. Called from ui.js after a search completes.

const POSTCODES_API = 'https://api.postcodes.io/postcodes';

// In-session postcode cache — avoids re-fetching the same postcode
// across multiple searches in one browser session.
const postcodeCache = {};

// Leaflet map instance — created once on first tab open, reused after.
let map = null;
let markerCluster = null;
let mapInitialised = false;
let geocodingComplete = false;

// ── Initialise the Leaflet map ──
// Called the first time the user clicks the Map tab.
// Leaflet needs the container to be visible before it can render correctly.
function initMap() {
  if (mapInitialised) return;
  mapInitialised = true;

  map = L.map('map-container', {
    center: [52.8, -2.0], // Centre of England
    zoom: 6,
    zoomControl: true,
    scrollWheelZoom: true
  });

  // OpenStreetMap tiles — free, no API key needed
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 18
  }).addTo(map);

  // MarkerCluster group — groups nearby pins automatically
  markerCluster = L.markerClusterGroup({
    showCoverageOnHover: false,
    maxClusterRadius: 50,
    spiderfyOnMaxZoom: true
  });

  map.addLayer(markerCluster);
}

// ── Geocode a batch of postcodes via Postcodes.io ──
// Sends up to 100 postcodes in one POST request.
// Returns a map of { postcode: { lat, lng } } for successful lookups.
async function geocodeBatch(postcodes) {
  // Filter out any already in cache
  const toFetch = postcodes.filter(p => !(p in postcodeCache));
  if (toFetch.length === 0) return;

  try {
    const response = await fetch(POSTCODES_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ postcodes: toFetch }),
      signal: AbortSignal.timeout(15000)
    });

    if (!response.ok) return;

    const data = await response.json();

    for (const item of (data.result || [])) {
      const postcode = item.query;
      if (item.result) {
        // Store in cache
        postcodeCache[postcode] = {
          lat: item.result.latitude,
          lng: item.result.longitude
        };
      } else {
        // Postcode not found — cache as null so we don't retry
        postcodeCache[postcode] = null;
      }
    }
  } catch {
    // Geocoding failed silently — map just won't show those pins
  }
}

// ── Geocode all results and place markers ──
// Called after a search completes. Runs in the background
// while the user is viewing the table.
async function geocodeAndRenderMap(results) {
  geocodingComplete = false;
  setMapTabBadge('loading');

  // Collect unique non-empty postcodes
  const unique = [...new Set(
    results
      .map(r => r.postcode)
      .filter(p => p && p.trim())
      .map(p => p.trim().toUpperCase())
  )];

  // Fetch in batches of 100 (Postcodes.io limit)
  for (let i = 0; i < unique.length; i += 100) {
    await geocodeBatch(unique.slice(i, i + 100));
  }

  geocodingComplete = true;
  setMapTabBadge('ready');

  // If the map tab is already open, render now
  // Otherwise renderMapMarkers() will be called when they switch to it
  const mapTabVisible = document.getElementById('tab-content-map').style.display !== 'none';
  if (mapTabVisible) {
    renderMapMarkers(results);
  }
}

// ── Place markers on the map ──
// Uses cached coordinates. Called either when geocoding finishes
// (if tab already open) or when the user clicks the Map tab.
function renderMapMarkers(results) {
  if (!mapInitialised) return;

  // Clear existing markers
  markerCluster.clearLayers();

  const bounds = [];
  let mapped = 0;

  for (const r of results) {
    const postcode = (r.postcode || '').trim().toUpperCase();
    if (!postcode) continue;

    const coords = postcodeCache[postcode];
    if (!coords) continue;

    mapped++;

    // Format value for popup
    const valueDisplay = r.value != null
      ? `£${Number(r.value).toLocaleString('en-GB', { maximumFractionDigits: 0 })}`
      : 'Value not specified';

    // Format closing date for popup
    let closesDisplay = 'No closing date';
    if (r.closes) {
      const d = new Date(r.closes);
      closesDisplay = `Closes ${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;
    }

    // Build popup HTML
    const popup = `
      <div class="popup-title">${escapeHtml(r.title)}</div>
      <div class="popup-buyer">${escapeHtml(r.buyer)}</div>
      <div class="popup-value">${valueDisplay}</div>
      <div class="popup-closes">${closesDisplay}</div>
      <a class="popup-link" href="${escapeHtml(r.link)}" target="_blank">View notice</a>
    `;

    const marker = L.marker([coords.lat, coords.lng]);
    marker.bindPopup(popup, { maxWidth: 280 });
    markerCluster.addLayer(marker);
    bounds.push([coords.lat, coords.lng]);
  }

  // Auto-fit map to show all pins
  if (bounds.length > 0) {
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
  }

  // Update coverage note
  const total = results.length;
  const missing = total - mapped;
  const coverageEl = document.getElementById('map-coverage');
  if (missing > 0) {
    coverageEl.textContent = `${mapped} of ${total} results shown on map — ${missing} had no postcode.`;
  } else {
    coverageEl.textContent = `All ${total} results shown on map.`;
  }

  // Hide the loading overlay
  hideMapLoading();
}

// ── Tab badge state ──
function setMapTabBadge(state) {
  const badge = document.getElementById('map-tab-badge');
  badge.className = 'tab-badge';
  if (state === 'loading') badge.classList.add('loading');
  if (state === 'ready')   badge.classList.add('ready');
}

function clearMapTabBadge() {
  document.getElementById('map-tab-badge').className = 'tab-badge';
}

// ── Map loading overlay ──
function showMapLoading() {
  const el = document.getElementById('map-loading');
  el.classList.remove('hidden');
}

function hideMapLoading() {
  const el = document.getElementById('map-loading');
  el.classList.add('hidden');
}

// ── Called from ui.js when the Map tab is clicked ──
// Initialises Leaflet if needed, then renders markers if geocoding is done,
// or shows the loading state if still in progress.
function onMapTabOpen(results) {
  initMap();

  // Leaflet needs a size invalidation after becoming visible
  setTimeout(() => map.invalidateSize(), 50);

  if (geocodingComplete) {
    renderMapMarkers(results);
  } else {
    // Still geocoding — show loading overlay, markers will render when done
    showMapLoading();
  }
}

// ── Reset map state between searches ──
function resetMap() {
  geocodingComplete = false;
  clearMapTabBadge();
  showMapLoading();
  if (markerCluster) markerCluster.clearLayers();
  document.getElementById('map-coverage').textContent = '';
}