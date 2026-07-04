import { describe, it, expect } from 'vitest';
import { parseBbox, buildQueryUrl } from '../api/crossings';

describe('parseBbox', () => {
  it('parses a valid bbox string', () => {
    const bbox = parseBbox('-87.8,41.7,-87.5,41.9');
    expect(bbox).toEqual({ minLon: -87.8, minLat: 41.7, maxLon: -87.5, maxLat: 41.9 });
  });

  it('rejects missing input', () => {
    expect(parseBbox(undefined)).toBeNull();
  });

  it('rejects malformed input', () => {
    expect(parseBbox('not,a,bbox')).toBeNull();
  });

  it('rejects an inverted bbox', () => {
    expect(parseBbox('-87.5,41.9,-87.8,41.7')).toBeNull();
  });

  it('rejects an array (repeated query param)', () => {
    expect(parseBbox(['-87.8,41.7,-87.5,41.9', '1,2,3,4'])).toBeNull();
  });
});

describe('buildQueryUrl', () => {
  it('builds a GeoJSON query against the FRA feature server', () => {
    const url = buildQueryUrl({ minLon: -87.8, minLat: 41.7, maxLon: -87.5, maxLat: 41.9 });
    expect(url).toContain('NTAD_Railroad_Grade_Crossings/FeatureServer/0/query');
    expect(url).toContain('f=geojson');
    expect(url).toContain('geometryType=esriGeometryEnvelope');
  });
});
