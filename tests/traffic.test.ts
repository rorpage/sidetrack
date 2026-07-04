import { describe, it, expect } from 'vitest';
import { classifySlowdown } from '../api/traffic';

describe('classifySlowdown', () => {
  it('reports clear when speed is near free flow', () => {
    const result = classifySlowdown(45, 50);
    expect(result.status).toBe('clear');
    expect(result.ratio).toBeCloseTo(0.9);
  });

  it('reports slow at a moderate drop', () => {
    const result = classifySlowdown(25, 50);
    expect(result.status).toBe('slow');
  });

  it('reports likely_blocked at a severe drop', () => {
    const result = classifySlowdown(5, 50);
    expect(result.status).toBe('likely_blocked');
  });

  it('treats a zero free flow speed as clear rather than dividing by zero', () => {
    const result = classifySlowdown(0, 0);
    expect(result.ratio).toBe(1);
    expect(result.status).toBe('clear');
  });
});
