import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Proxies the FRA / BTS National Highway-Rail Crossing Inventory (NTAD),
 * published as a public ArcGIS FeatureServer layer with no API key required.
 *
 * Source layer: NTAD_Railroad_Grade_Crossings (FRA / BTS, public domain, 17 U.S.C. 101)
 * https://services.arcgis.com/xOi1kZaI0eWDREZv/arcgis/rest/services/NTAD_Railroad_Grade_Crossings/FeatureServer/0
 *
 * We query it server side so the browser never has to know the ArcGIS query
 * syntax, and so we can cache responses at the edge.
 */

const FRA_FEATURE_SERVER =
  'https://services.arcgis.com/xOi1kZaI0eWDREZv/arcgis/rest/services/NTAD_Railroad_Grade_Crossings/FeatureServer/0/query';

const OUT_FIELDS = [
  'CROSSING',
  'RAILROAD',
  'STREET',
  'HIGHWAY',
  'CITYNAME',
  'STATEAB',
  'TYPEXING',
  'POSXING',
  'LATDD',
  'LONGDD',
].join(',');

export interface BoundingBox {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}

export function parseBbox(raw: string | string[] | undefined): BoundingBox | null {
  if (!raw || Array.isArray(raw)) return null;
  const parts = raw.split(',').map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return null;
  const [minLon, minLat, maxLon, maxLat] = parts;
  if (minLon >= maxLon || minLat >= maxLat) return null;
  return { minLon, minLat, maxLon, maxLat };
}

export function buildQueryUrl(bbox: BoundingBox): string {
  const params = new URLSearchParams({
    where: '1=1',
    outFields: OUT_FIELDS,
    geometry: `${bbox.minLon},${bbox.minLat},${bbox.maxLon},${bbox.maxLat}`,
    geometryType: 'esriGeometryEnvelope',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    resultRecordCount: '500',
    f: 'geojson',
  });
  return `${FRA_FEATURE_SERVER}?${params.toString()}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const bbox = parseBbox(req.query.bbox);

  if (!bbox) {
    res.status(400).json({
      error: 'Provide a bbox query param: minLon,minLat,maxLon,maxLat',
    });
    return;
  }

  const width = bbox.maxLon - bbox.minLon;
  const height = bbox.maxLat - bbox.minLat;
  if (width > 2 || height > 2) {
    res.status(400).json({ error: 'bbox is too large, keep it under ~2 degrees per side' });
    return;
  }

  try {
    const upstream = await fetch(buildQueryUrl(bbox));
    if (!upstream.ok) {
      res.status(502).json({ error: 'FRA crossing service unavailable' });
      return;
    }
    const geojson = await upstream.json();

    // Cache at the edge for 6 hours, crossing locations rarely change.
    res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate=86400');
    res.status(200).json(geojson);
  } catch (err) {
    res.status(502).json({ error: 'Failed to reach FRA crossing service' });
  }
}
