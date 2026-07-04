// Sidetrack frontend. No build step, no framework: Leaflet for the map,
// native Web Components for the two bits of UI chrome, Tailwind via CDN
// for styling. Mirrors the zero-dependency pattern used in Rutetid.

const STATUS_COLORS = {
  clear: '#16a34a',
  slow: '#f59e0b',
  likely_blocked: '#dc2626',
  unknown: '#64748b',
};

const STATUS_LABELS = {
  clear: 'Clear',
  slow: 'Slow',
  likely_blocked: 'Likely blocked',
  unknown: 'Unknown',
};

/** <status-legend>: small color key shown in the header. */
class StatusLegend extends HTMLElement {
  connectedCallback() {
    this.className = 'flex items-center gap-3 text-xs text-slate-300';
    this.innerHTML = Object.entries(STATUS_LABELS)
      .map(
        ([status, label]) => `
        <span class="flex items-center gap-1">
          <span class="inline-block w-2.5 h-2.5 rounded-full" style="background:${STATUS_COLORS[status]}"></span>
          ${label}
        </span>`
      )
      .join('');
  }
}
customElements.define('status-legend', StatusLegend);

/** <route-panel>: origin/destination inputs and the resulting route summary. */
class RoutePanel extends HTMLElement {
  connectedCallback() {
    this.className +=
      ' bg-white rounded-lg shadow-lg p-4 w-72 space-y-3 text-sm';
    this.innerHTML = `
      <div>
        <label class="block text-xs font-medium text-slate-600 mb-1">From</label>
        <input id="origin" type="text" placeholder="lat,lon or click the map"
          class="w-full border border-slate-300 rounded px-2 py-1.5 text-sm" />
      </div>
      <div>
        <label class="block text-xs font-medium text-slate-600 mb-1">To</label>
        <input id="destination" type="text" placeholder="lat,lon or click the map"
          class="w-full border border-slate-300 rounded px-2 py-1.5 text-sm" />
      </div>
      <button id="route-btn" class="w-full bg-slate-900 text-white rounded px-3 py-1.5 font-medium hover:bg-slate-700">
        Find route
      </button>
      <p class="text-xs text-slate-500">
        Click the map to set From, then click again to set To. Crossings
        marked red are routed around automatically.
      </p>
      <div id="route-summary" class="text-xs text-slate-700"></div>
    `;
  }

  get originValue() {
    return this.querySelector('#origin').value.trim();
  }
  set originValue(value) {
    this.querySelector('#origin').value = value;
  }
  get destinationValue() {
    return this.querySelector('#destination').value.trim();
  }
  set destinationValue(value) {
    this.querySelector('#destination').value = value;
  }
  onRouteRequested(callback) {
    this.querySelector('#route-btn').addEventListener('click', callback);
  }
  setSummary(text) {
    this.querySelector('#route-summary').textContent = text;
  }
}
customElements.define('route-panel', RoutePanel);

// --- Map setup -------------------------------------------------------

const map = L.map('map').setView([41.8781, -87.6298], 12); // Chicago, a reasonable default
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors',
  maxZoom: 19,
}).addTo(map);

// Recenter on the user's location if they grant permission; keep the
// Chicago default otherwise (denied, unsupported, or timed out).
if (navigator.geolocation) {
  navigator.geolocation.getCurrentPosition(
    (position) => {
      map.setView([position.coords.latitude, position.coords.longitude], 14);
    },
    () => {},
    { timeout: 8000 }
  );
}

const crossingLayer = L.layerGroup().addTo(map);
const crossingMarkers = new Map(); // crossingId -> { marker, lat, lon, status }
let routeLine = null;

function crossingIcon(status) {
  return L.divIcon({
    className: '',
    html: `<div style="width:14px;height:14px;border-radius:50%;background:${STATUS_COLORS[status]};border:2px solid white;box-shadow:0 0 2px rgba(0,0,0,0.5)"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

function bboxOfMap() {
  const b = map.getBounds();
  return [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()].join(',');
}

async function loadCrossings() {
  const bbox = bboxOfMap();
  let geojson;
  try {
    const response = await fetch(`/api/crossings?bbox=${encodeURIComponent(bbox)}`);
    if (!response.ok) return;
    geojson = await response.json();
  } catch (err) {
    console.error('Failed to load crossings', err);
    return;
  }

  const seenIds = new Set();

  for (const feature of geojson.features ?? []) {
    const id = feature.properties?.CROSSING;
    if (!id) continue;
    seenIds.add(id);
    if (crossingMarkers.has(id)) continue;

    const [lon, lat] = feature.geometry.coordinates;
    const marker = L.marker([lat, lon], { icon: crossingIcon('unknown') });
    const street = feature.properties?.STREET || feature.properties?.HIGHWAY || 'Unnamed crossing';
    const railroad = feature.properties?.RAILROAD || '';
    marker.bindPopup(`<strong>${street}</strong><br/>${railroad}<br/><span class="status-text">Checking traffic...</span>`);
    marker.addTo(crossingLayer);

    crossingMarkers.set(id, { marker, lat, lon, status: 'unknown' });
  }

  // Drop markers that scrolled out of view to keep the map light.
  for (const [id, entry] of crossingMarkers) {
    if (!seenIds.has(id)) {
      crossingLayer.removeLayer(entry.marker);
      crossingMarkers.delete(id);
    }
  }
}

async function refreshTrafficForVisibleCrossings() {
  const entries = [...crossingMarkers.entries()];
  // Cap concurrent requests so a busy viewport does not hammer the traffic API.
  const batchSize = 8;
  for (let i = 0; i < entries.length; i += batchSize) {
    const batch = entries.slice(i, i + batchSize);
    await Promise.all(
      batch.map(async ([id, entry]) => {
        try {
          const response = await fetch(`/api/traffic?lat=${entry.lat}&lon=${entry.lon}`);
          if (!response.ok) return;
          const result = await response.json();
          entry.status = result.status;
          entry.marker.setIcon(crossingIcon(result.status));
          const speedNote = `${Math.round(result.currentSpeed)} of ${Math.round(result.freeFlowSpeed)} mph`;
          entry.marker.setPopupContent(
            entry.marker
              .getPopup()
              .getContent()
              .replace(/<span class="status-text">.*<\/span>/, `<span class="status-text">${STATUS_LABELS[result.status]} (${speedNote})</span>`)
          );
        } catch (err) {
          // A single failed lookup should not break the rest of the batch.
        }
      })
    );
  }
}

let moveTimeout = null;
map.on('moveend', () => {
  clearTimeout(moveTimeout);
  moveTimeout = setTimeout(loadCrossings, 300);
});

loadCrossings();
setInterval(refreshTrafficForVisibleCrossings, 30_000);
// Kick off an initial traffic pass shortly after crossings load.
setTimeout(refreshTrafficForVisibleCrossings, 1500);

// --- Routing -----------------------------------------------------------

const routePanel = document.querySelector('route-panel');
let clickTarget = 'origin';

map.on('click', (e) => {
  const value = `${e.latlng.lat.toFixed(5)},${e.latlng.lng.toFixed(5)}`;
  if (clickTarget === 'origin') {
    routePanel.originValue = value;
    clickTarget = 'destination';
  } else {
    routePanel.destinationValue = value;
    clickTarget = 'origin';
  }
});

routePanel.onRouteRequested(async () => {
  const origin = routePanel.originValue;
  const destination = routePanel.destinationValue;
  if (!origin || !destination) {
    routePanel.setSummary('Set both a start and end point first.');
    return;
  }

  const blockedCrossings = [...crossingMarkers.values()]
    .filter((entry) => entry.status === 'likely_blocked')
    .map((entry) => ({ lat: entry.lat, lon: entry.lon }));

  routePanel.setSummary('Calculating route...');

  try {
    const response = await fetch('/api/route', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ origin, destination, blockedCrossings }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      routePanel.setSummary(err.error || 'Could not calculate a route.');
      return;
    }
    const data = await response.json();
    const route = data.routes?.[0];
    if (!route) {
      routePanel.setSummary('No route found.');
      return;
    }

    if (routeLine) map.removeLayer(routeLine);
    const points = route.legs.flatMap((leg) => leg.points.map((p) => [p.latitude, p.longitude]));
    routeLine = L.polyline(points, { color: '#2563eb', weight: 5, opacity: 0.8 }).addTo(map);
    map.fitBounds(routeLine.getBounds(), { padding: [40, 40] });

    const minutes = Math.round(route.summary.travelTimeInSeconds / 60);
    const miles = (route.summary.lengthInMeters / 1609.34).toFixed(1);
    const avoided = blockedCrossings.length;
    routePanel.setSummary(
      `${miles} mi, about ${minutes} min.` +
        (avoided > 0 ? ` Routed around ${avoided} likely-blocked crossing${avoided > 1 ? 's' : ''}.` : '')
    );
  } catch (err) {
    routePanel.setSummary('Could not reach the routing service.');
  }
});
