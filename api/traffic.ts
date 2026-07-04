import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * We have no public feed of live gate/train status, so we infer a likely
 * blockage from how much slower traffic is moving near a crossing compared
 * to its free flow speed. This is a proxy, not a certainty: a slowdown can
 * also mean an accident, construction, or rush hour. The frontend labels it
 * as "likely blocked" rather than "train detected" for that reason.
 *
 * Uses TomTom's Traffic Flow Segment Data API.
 * https://developer.tomtom.com/traffic-api/documentation/traffic-flow/flow-segment-data
 */

const TOMTOM_FLOW_URL =
  'https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json';

export type SlowdownStatus = 'clear' | 'slow' | 'likely_blocked';

export interface SlowdownResult {
  status: SlowdownStatus;
  currentSpeed: number;
  freeFlowSpeed: number;
  ratio: number;
}

export function classifySlowdown(currentSpeed: number, freeFlowSpeed: number): SlowdownResult {
  const ratio = freeFlowSpeed > 0 ? currentSpeed / freeFlowSpeed : 1;
  let status: SlowdownStatus = 'clear';
  if (ratio < 0.35) status = 'likely_blocked';
  else if (ratio < 0.7) status = 'slow';
  return { status, currentSpeed, freeFlowSpeed, ratio };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { lat, lon } = req.query;
  const apiKey = process.env.TOMTOM_API_KEY;

  if (!apiKey) {
    res.status(500).json({ error: 'TOMTOM_API_KEY is not configured' });
    return;
  }
  if (typeof lat !== 'string' || typeof lon !== 'string') {
    res.status(400).json({ error: 'Provide lat and lon query params' });
    return;
  }

  const point = `${lat},${lon}`;
  const url = `${TOMTOM_FLOW_URL}?point=${encodeURIComponent(point)}&unit=mph&key=${apiKey}`;

  try {
    const upstream = await fetch(url);
    if (!upstream.ok) {
      res.status(502).json({ error: 'Traffic service unavailable' });
      return;
    }
    const data = (await upstream.json()) as { flowSegmentData?: { currentSpeed: number; freeFlowSpeed: number } };
    const segment = data?.flowSegmentData;
    if (!segment) {
      res.status(502).json({ error: 'Unexpected traffic service response' });
      return;
    }

    const result = classifySlowdown(segment.currentSpeed, segment.freeFlowSpeed);

    // Short cache, traffic conditions change fast.
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=30');
    res.status(200).json(result);
  } catch (err) {
    res.status(502).json({ error: 'Failed to reach traffic service' });
  }
}
