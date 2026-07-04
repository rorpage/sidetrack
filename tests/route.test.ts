import { describe, it, expect } from 'vitest';
import { buildAvoidRectangles } from '../api/route';

describe('buildAvoidRectangles', () => {
  it('returns an empty list for no blocked crossings', () => {
    expect(buildAvoidRectangles([])).toEqual([]);
  });

  it('centers a rectangle on each blocked crossing', () => {
    const [rect] = buildAvoidRectangles([{ lat: 41.8, lon: -87.6 }]);
    expect(rect.southWestCorner.latitude).toBeLessThan(41.8);
    expect(rect.northEastCorner.latitude).toBeGreaterThan(41.8);
    expect(rect.southWestCorner.longitude).toBeLessThan(-87.6);
    expect(rect.northEastCorner.longitude).toBeGreaterThan(-87.6);
  });

  it('builds one rectangle per blocked crossing', () => {
    const rects = buildAvoidRectangles([
      { lat: 41.8, lon: -87.6 },
      { lat: 42.1, lon: -88.0 },
    ]);
    expect(rects).toHaveLength(2);
  });
});
