import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Calculates a driving route between two points, steering around any
 * crossings the caller has flagged as likely blocked. Each avoided crossing
 * becomes a small rectangle centered on its coordinates, passed to TomTom's
 * avoidAreas parameter.
 *
 * https://developer.tomtom.com/routing-api/documentation/tomtom-maps/v1/calculate-route
 */

const TOMTOM_ROUTE_BASE = 'https://api.tomtom.com/routing/1/calculateRoute';

// Roughly 150 meters in each direction, enough to force a detour around a
// crossing without excluding the whole neighborhood.
const AVOID_BOX_DEGREES = 0.0015;

export interface LatLon {
  lat: number;
  lon: number;
}

export function buildAvoidRectangles(blockedCrossings: LatLon[]) {
  return blockedCrossings.map(({ lat, lon }) => ({
    southWestCorner: { latitude: lat - AVOID_BOX_DEGREES, longitude: lon - AVOID_BOX_DEGREES },
    northEastCorner: { latitude: lat + AVOID_BOX_DEGREES, longitude: lon + AVOID_BOX_DEGREES },
  }));
}

function parsePoint(raw: unknown): LatLon | null {
  if (typeof raw !== 'string') return null;
  const [lat, lon] = raw.split(',').map(Number);
  if (Number.isNaN(lat) || Number.isNaN(lon)) return null;
  return { lat, lon };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const apiKey = process.env.TOMTOM_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'TOMTOM_API_KEY is not configured' });
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Use POST' });
    return;
  }

  const { origin, destination, blockedCrossings } = req.body ?? {};
  const originPoint = parsePoint(origin);
  const destinationPoint = parsePoint(destination);

  if (!originPoint || !destinationPoint) {
    res.status(400).json({ error: 'origin and destination must be "lat,lon" strings' });
    return;
  }

  const blocked: LatLon[] = Array.isArray(blockedCrossings) ? blockedCrossings : [];
  const body =
    blocked.length > 0
      ? { avoidAreas: { rectangles: buildAvoidRectangles(blocked) } }
      : {};

  const url = `${TOMTOM_ROUTE_BASE}/${originPoint.lat},${originPoint.lon}:${destinationPoint.lat},${destinationPoint.lon}/json?key=${apiKey}&traffic=true`;

  try {
    const upstream = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!upstream.ok) {
      res.status(502).json({ error: 'Routing service unavailable' });
      return;
    }
    const data = await upstream.json();
    res.status(200).json(data);
  } catch (err) {
    res.status(502).json({ error: 'Failed to reach routing service' });
  }
}
